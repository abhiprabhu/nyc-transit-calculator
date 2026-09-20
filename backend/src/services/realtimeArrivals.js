// Real-time subway arrivals (phase 9, stretch). Fetches and decodes MTA's
// GTFS-realtime TripUpdate feeds and filters them down to one station.
//
// Known simplifications (v1):
//  - Subway only, matching the rest of the app (see gtfsLoader.js).
//  - As of GTFS-realtime v2.0.0 the MTA no longer requires an API key for
//    these feeds — see https://api.mta.info/. If that changes, an API key
//    would need to be sent as an `x-api-key` header here.
//  - "Direction" is the raw GTFS platform suffix ("N"/"S"), which is *not*
//    always literal north/south (e.g. on the G train "N" means "toward
//    Court Sq"). We surface it as-is rather than guessing a headsign,
//    since GTFS-realtime trip updates don't carry a rider-friendly
//    direction label.
//  - Feed responses are cached in-process for FEED_CACHE_MS to stay well
//    under a reasonable poll rate against a shared public feed; this means
//    arrivals can be up to that many seconds stale on top of MTA's own
//    feed refresh cadence (~30s).
import GtfsRealtimeBindings from "gtfs-realtime-bindings";

import { pool } from "../db/client.js";

const FEED_URLS = {
  ace: "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-ace",
  bdfm: "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm",
  g: "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-g",
  jz: "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-jz",
  nqrw: "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-nqrw",
  l: "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-l",
  numbered: "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs",
};

// Maps GTFS route_id (as stored in edges.line) to which feed carries it.
// See https://api.mta.info/ for the current grouping. "SI" (Staten Island
// Railway) is declared in routes.txt but has no trips in the subway static
// feed we ingest, so it's intentionally left out.
const ROUTE_TO_FEED = {
  A: "ace", C: "ace", E: "ace", H: "ace", FS: "ace",
  B: "bdfm", D: "bdfm", F: "bdfm", FX: "bdfm", M: "bdfm",
  G: "g",
  J: "jz", Z: "jz",
  N: "nqrw", Q: "nqrw", R: "nqrw", W: "nqrw",
  L: "l",
  1: "numbered", 2: "numbered", 3: "numbered", 4: "numbered", 5: "numbered",
  6: "numbered", "6X": "numbered", 7: "numbered", "7X": "numbered", GS: "numbered",
};

const FEED_CACHE_MS = 20_000;
const FEED_FETCH_TIMEOUT_MS = 8_000;
const MAX_ARRIVALS = 8;

const feedCache = new Map(); // feedKey -> { fetchedAt, entities }

async function fetchFeed(feedKey) {
  const cached = feedCache.get(feedKey);
  if (cached && Date.now() - cached.fetchedAt < FEED_CACHE_MS) {
    return cached.entities;
  }

  const res = await fetch(FEED_URLS[feedKey], { signal: AbortSignal.timeout(FEED_FETCH_TIMEOUT_MS) });
  if (!res.ok) {
    throw new Error(`MTA feed '${feedKey}' returned HTTP ${res.status}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const message = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(buffer);

  feedCache.set(feedKey, { fetchedAt: Date.now(), entities: message.entity });
  return message.entity;
}

// Pure function: entities + platform stop ids in, sorted arrivals out.
// Separated from getArrivalsForStation so it's testable without a feed
// fetch or DB connection.
export function extractArrivals(entities, platformStopIds, nowSeconds = Math.floor(Date.now() / 1000)) {
  const stopIdSet = new Set(platformStopIds.map((p) => p.stopId));
  const directionByStopId = new Map(platformStopIds.map((p) => [p.stopId, p.direction]));

  const arrivals = [];
  for (const entity of entities) {
    const tripUpdate = entity.tripUpdate;
    if (!tripUpdate) continue;
    const routeId = tripUpdate.trip?.routeId;

    for (const stopTimeUpdate of tripUpdate.stopTimeUpdate || []) {
      if (!stopIdSet.has(stopTimeUpdate.stopId)) continue;
      const arrivalTime = stopTimeUpdate.arrival?.time;
      if (arrivalTime == null) continue;
      const arrivalTimestamp = Number(arrivalTime);
      if (arrivalTimestamp < nowSeconds) continue;

      arrivals.push({
        routeId,
        direction: directionByStopId.get(stopTimeUpdate.stopId) ?? null,
        arrivalTimestamp,
        secondsAway: arrivalTimestamp - nowSeconds,
      });
    }
  }

  arrivals.sort((a, b) => a.arrivalTimestamp - b.arrivalTimestamp);
  return arrivals.slice(0, MAX_ARRIVALS);
}

export async function getArrivalsForStation(stationId) {
  const [platformsResult, routesResult] = await Promise.all([
    pool.query("SELECT stop_id, direction FROM station_platforms WHERE station_id = $1", [stationId]),
    pool.query(
      `SELECT DISTINCT line FROM edges
       WHERE mode = 'subway' AND (from_station_id = $1 OR to_station_id = $1)`,
      [stationId],
    ),
  ]);

  if (platformsResult.rows.length === 0) {
    return { arrivals: [], failedFeeds: [] };
  }

  const platformStopIds = platformsResult.rows.map((r) => ({ stopId: r.stop_id, direction: r.direction }));

  const feedKeys = new Set();
  for (const row of routesResult.rows) {
    const feedKey = ROUTE_TO_FEED[row.line];
    if (feedKey) feedKeys.add(feedKey);
  }

  const failedFeeds = [];
  const entityLists = await Promise.all(
    [...feedKeys].map(async (feedKey) => {
      try {
        return await fetchFeed(feedKey);
      } catch (err) {
        console.error(`Failed to fetch/parse MTA feed '${feedKey}':`, err.message);
        failedFeeds.push(feedKey);
        return [];
      }
    }),
  );

  const allEntities = entityLists.flat();
  const arrivals = extractArrivals(allEntities, platformStopIds);

  return { arrivals, failedFeeds };
}

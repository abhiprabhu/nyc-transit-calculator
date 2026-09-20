// Live PATH arrivals (path-realtime-feature-brief.md, build order step 2+).
// Polls the PATH GTFS-Realtime feed on an interval and keeps a small
// in-memory map of upcoming arrivals per station, per the brief's design.
//
// Known simplifications (see path-realtime-feature-brief.md and
// backend/src/data/pathStations.js):
//  - No trip continuity and no platform detail in the source feed — each
//    entity is a dummy trip with a single stopTimeUpdate, so this only
//    supports "next arrivals at this station", not tracking one train.
//    (trip.directionId is present though, so "toward NY"/"toward NJ" is
//    derivable even without platform-level stops — see DIRECTION_LABELS.)
//  - No delaySeconds: the feed carries no scheduled time to diff a
//    predicted time against, and there's no static GTFS join available for
//    PATH in this app (see pathStations.js), so a real delay figure isn't
//    derivable. Arrivals are shown as live predicted times only.
//  - Service alerts (Port Authority's Everbridge feed) are the brief's v2
//    stretch goal and aren't implemented here.
import GtfsRealtimeBindings from "gtfs-realtime-bindings";

import { PATH_ROUTE_NAMES, PATH_STOP_IDS } from "../data/pathStations.js";

const PATH_FEED_URL = "https://path.transitdata.nyc/gtfsrt";
const POLL_INTERVAL_MS = 12_000;
const FETCH_TIMEOUT_MS = 8_000;
const MAX_ARRIVALS = 5;

// trip.directionId: 1 = toward NY (WTC/33rd St side), 0 = toward NJ. Per
// github.com/jamespfennell/path-train-gtfs-realtime's directionToBoolean()
// (pathgtfsrt.go) — this isn't documented on the feed itself.
const DIRECTION_LABELS = { 0: "toward NJ", 1: "toward NY" };

let arrivalsByStation = new Map(); // stopId -> arrivals[]
let lastFetchedAt = null;
let lastError = null;
let pollHandle = null;

function extractArrivalsByStation(entities, nowSeconds) {
  const map = new Map();

  for (const entity of entities) {
    const tripUpdate = entity.tripUpdate;
    if (!tripUpdate) continue;
    const routeId = tripUpdate.trip?.routeId;
    const direction = DIRECTION_LABELS[tripUpdate.trip?.directionId] ?? null;

    for (const stopTimeUpdate of tripUpdate.stopTimeUpdate || []) {
      if (!PATH_STOP_IDS.has(stopTimeUpdate.stopId)) continue;
      const arrivalTime = stopTimeUpdate.arrival?.time;
      if (arrivalTime == null) continue;

      const arrivalTimestamp = Number(arrivalTime);
      if (arrivalTimestamp < nowSeconds) continue;

      const list = map.get(stopTimeUpdate.stopId) ?? [];
      list.push({
        routeId,
        routeName: PATH_ROUTE_NAMES[routeId] ?? `Route ${routeId}`,
        direction,
        arrivalTimestamp,
        secondsAway: arrivalTimestamp - nowSeconds,
      });
      map.set(stopTimeUpdate.stopId, list);
    }
  }

  for (const list of map.values()) {
    list.sort((a, b) => a.arrivalTimestamp - b.arrivalTimestamp);
  }
  return map;
}

async function poll() {
  try {
    const res = await fetch(PATH_FEED_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) {
      throw new Error(`PATH feed returned HTTP ${res.status}`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    const message = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(buffer);

    arrivalsByStation = extractArrivalsByStation(message.entity, Math.floor(Date.now() / 1000));
    lastFetchedAt = Date.now();
    lastError = null;
  } catch (err) {
    lastError = err.message;
    console.error("Failed to fetch/parse PATH feed:", err.message);
  }
}

// Idempotent: call once at server startup. Keeps a background poll running
// for the lifetime of the process rather than fetching per-request, per the
// brief (the feed itself only updates every 5s, so per-request fetching
// would be both slower for callers and needlessly hard on a shared feed).
export function startPolling() {
  if (pollHandle) return;
  poll();
  pollHandle = setInterval(poll, POLL_INTERVAL_MS);
  pollHandle.unref?.();
}

export function getUpcomingArrivals(stopId) {
  if (!PATH_STOP_IDS.has(stopId)) return null;

  return {
    arrivals: (arrivalsByStation.get(stopId) ?? []).slice(0, MAX_ARRIVALS),
    stale: lastError !== null,
    lastFetchedAt,
  };
}

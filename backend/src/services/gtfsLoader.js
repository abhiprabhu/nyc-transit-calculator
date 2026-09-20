// Downloads the MTA subway GTFS static feed, parses it, and loads
// stations + edges into Postgres for the graph engine (phase 3) to
// consume.
//
// Known simplifications (v1):
//  - Subway only. The MTA bus GTFS feed is a separate, much larger
//    feed; wiring it in is left for a later phase.
//  - "Station" = a GTFS parent station (stops.txt location_type=1).
//    Directional platform stops (e.g. "101N"/"101S") are collapsed
//    into their parent for graph purposes.
//  - Edge travel time is the *average* observed time between two
//    consecutive stops across every trip in the feed (one static
//    schedule snapshot, not live/historical run times).
//  - Borough is derived from lat/lon via approximate bounding boxes
//    (subway doesn't serve Staten Island, so only 4 boroughs matter
//    here). A handful of stations near borough borders — e.g. across
//    the Harlem River between Manhattan and the Bronx — may be
//    misclassified. It's informational only; routing/fares don't use it.
import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import { parse } from "csv-parse/sync";

import { pool } from "../db/client.js";

const DEFAULT_FEED_URL = "https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip";

function deriveBorough(lat, lon) {
  if (lat <= 40.879 && lat >= 40.70 && lon >= -74.02 && lon <= -73.907) {
    return "Manhattan";
  }
  if (lat >= 40.785) {
    return "Bronx";
  }
  if (lat <= 40.739 && lon <= -73.833) {
    return "Brooklyn";
  }
  return "Queens";
}

function parseGtfsTime(hhmmss) {
  // GTFS allows hours >= 24 for post-midnight trips on the same
  // service day (e.g. "25:30:00"), so this stays a flat second count
  // rather than wrapping into a Date.
  const [h, m, s] = hhmmss.split(":").map(Number);
  return h * 3600 + m * 60 + s;
}

export async function downloadFeed({ url = DEFAULT_FEED_URL, destPath }) {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download GTFS feed: ${res.status} ${res.statusText}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buffer);
  return destPath;
}

export function extractFeed(zipPath, destDir) {
  const zip = new AdmZip(zipPath);
  fs.mkdirSync(destDir, { recursive: true });
  zip.extractAllTo(destDir, true);
  return destDir;
}

function readCsv(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return parse(raw, { columns: true, skip_empty_lines: true });
}

// Parses stops.txt into:
//  - stations: one row per parent station (location_type=1)
//  - stopIdToParent: maps every stop_id (platform or parent) to its
//    parent station id, so stop_times.txt rows can be mapped onto
//    graph nodes.
//  - platforms: the platform-level rows that got collapsed into a parent
//    (e.g. "127N"/"127S" -> "127"), kept around for real-time arrivals
//    (phase 9), which needs to match GTFS-realtime's per-platform
//    stop_time_update.stop_id back to a station.
export function parseStops(filePath) {
  const rows = readCsv(filePath);
  const stations = [];
  const stopIdToParent = new Map();
  const platforms = [];

  for (const row of rows) {
    if (row.location_type === "1") {
      const lat = Number(row.stop_lat);
      const lon = Number(row.stop_lon);
      stations.push({
        id: row.stop_id,
        name: row.stop_name,
        lat,
        lon,
        borough: deriveBorough(lat, lon),
      });
      stopIdToParent.set(row.stop_id, row.stop_id);
    }
  }
  for (const row of rows) {
    if (row.location_type !== "1" && row.parent_station) {
      stopIdToParent.set(row.stop_id, row.parent_station);
      const lastChar = row.stop_id.slice(-1);
      platforms.push({
        stopId: row.stop_id,
        stationId: row.parent_station,
        direction: lastChar === "N" || lastChar === "S" ? lastChar : null,
      });
    }
  }

  return { stations, stopIdToParent, platforms };
}

// trip_headsign is what riders actually see on the train and platform
// signage (e.g. "Woodlawn", "South Ferry") — the most rider-legible way
// to say "this is the direction to take", so it's carried alongside
// route_id for buildSubwayEdges to attach to each edge.
export function parseTripInfo(filePath) {
  const rows = readCsv(filePath);
  const tripToRoute = new Map();
  const tripToHeadsign = new Map();
  for (const row of rows) {
    tripToRoute.set(row.trip_id, row.route_id);
    if (row.trip_headsign) {
      tripToHeadsign.set(row.trip_id, row.trip_headsign);
    }
  }
  return { tripToRoute, tripToHeadsign };
}

function mostCommon(counts) {
  let best = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

// Walks stop_times.txt (sorted by trip_id, stop_sequence) and builds one
// aggregated edge per (from station, to station, line), averaging travel
// time across every trip that makes that hop and taking the headsign
// most trips on that hop displayed (a handful of trips run truncated or
// via a variant pattern with a different headsign for the same hop).
export function buildSubwayEdges(filePath, stopIdToParent, tripToRoute, tripToHeadsign) {
  const rows = readCsv(filePath);
  const agg = new Map(); // key -> { fromId, toId, line, totalSeconds, count, headsignCounts }

  let prevTripId = null;
  let prevStop = null;

  for (const row of rows) {
    const tripId = row.trip_id;
    if (tripId !== prevTripId) {
      prevTripId = tripId;
      prevStop = row;
      continue;
    }

    const fromParent = stopIdToParent.get(prevStop.stop_id);
    const toParent = stopIdToParent.get(row.stop_id);
    const line = tripToRoute.get(tripId);

    if (fromParent && toParent && fromParent !== toParent && line) {
      const travelSeconds = parseGtfsTime(row.arrival_time) - parseGtfsTime(prevStop.departure_time);
      if (travelSeconds > 0) {
        const key = `${fromParent}|${toParent}|subway|${line}`;
        const headsign = tripToHeadsign.get(tripId) ?? null;
        const existing = agg.get(key);
        if (existing) {
          existing.totalSeconds += travelSeconds;
          existing.count += 1;
          if (headsign) {
            existing.headsignCounts.set(headsign, (existing.headsignCounts.get(headsign) ?? 0) + 1);
          }
        } else {
          agg.set(key, {
            fromId: fromParent,
            toId: toParent,
            line,
            totalSeconds: travelSeconds,
            count: 1,
            headsignCounts: headsign ? new Map([[headsign, 1]]) : new Map(),
          });
        }
      }
    }

    prevStop = row;
  }

  return Array.from(agg.values()).map((e) => ({
    fromStationId: e.fromId,
    toStationId: e.toId,
    mode: "subway",
    line: e.line,
    travelTimeSeconds: Math.round(e.totalSeconds / e.count),
    headsign: mostCommon(e.headsignCounts),
  }));
}

// transfers.txt is already keyed by parent station id in this feed,
// so no id mapping is needed here — just drop same-station rows
// (in-station dwell, not a graph edge).
export function buildTransferEdges(filePath) {
  const rows = readCsv(filePath);
  const edges = [];
  for (const row of rows) {
    if (row.from_stop_id !== row.to_stop_id) {
      edges.push({
        fromStationId: row.from_stop_id,
        toStationId: row.to_stop_id,
        mode: "transfer",
        line: null,
        travelTimeSeconds: Number(row.min_transfer_time),
        headsign: null,
      });
    }
  }
  return edges;
}

export async function loadIntoPostgres({ stations, platforms, edges }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("TRUNCATE edges, station_platforms, stations RESTART IDENTITY CASCADE");

    for (const s of stations) {
      await client.query(
        "INSERT INTO stations (id, name, lat, lon, borough) VALUES ($1, $2, $3, $4, $5)",
        [s.id, s.name, s.lat, s.lon, s.borough],
      );
    }

    for (const p of platforms) {
      await client.query(
        "INSERT INTO station_platforms (stop_id, station_id, direction) VALUES ($1, $2, $3) ON CONFLICT (stop_id) DO NOTHING",
        [p.stopId, p.stationId, p.direction],
      );
    }

    for (const e of edges) {
      await client.query(
        `INSERT INTO edges (from_station_id, to_station_id, mode, line, travel_time_seconds, headsign)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (from_station_id, to_station_id, mode, line) DO NOTHING`,
        [e.fromStationId, e.toStationId, e.mode, e.line, e.travelTimeSeconds, e.headsign],
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function ingest({ feedUrl, workDir, skipDownload = false } = {}) {
  const zipPath = path.join(workDir, "gtfs_subway.zip");
  const extractDir = path.join(workDir, "extracted");

  if (!skipDownload || !fs.existsSync(zipPath)) {
    console.log("Downloading GTFS feed...");
    await downloadFeed({ url: feedUrl, destPath: zipPath });
  }

  console.log("Extracting feed...");
  extractFeed(zipPath, extractDir);

  console.log("Parsing stops...");
  const { stations, stopIdToParent, platforms } = parseStops(path.join(extractDir, "stops.txt"));
  console.log(`  ${stations.length} stations, ${platforms.length} platforms`);

  console.log("Parsing trips...");
  const { tripToRoute, tripToHeadsign } = parseTripInfo(path.join(extractDir, "trips.txt"));

  console.log("Building subway edges from stop_times (this is the slow step)...");
  const subwayEdges = buildSubwayEdges(
    path.join(extractDir, "stop_times.txt"),
    stopIdToParent,
    tripToRoute,
    tripToHeadsign,
  );
  console.log(`  ${subwayEdges.length} subway edges`);

  console.log("Building transfer edges...");
  const transferEdges = buildTransferEdges(path.join(extractDir, "transfers.txt"));
  console.log(`  ${transferEdges.length} transfer edges`);

  console.log("Loading into Postgres...");
  await loadIntoPostgres({ stations, platforms, edges: [...subwayEdges, ...transferEdges] });

  console.log("Done.");
}

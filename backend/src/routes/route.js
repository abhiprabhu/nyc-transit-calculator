import { Router } from "express";

import { getGraph, shortestPath } from "../services/graph.js";
import { findNearestStation } from "../services/nearestStation.js";
import { calculateFare } from "../services/fareRules.js";

const router = Router();

function parseRiderHistory(raw) {
  if (!raw) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("'riderHistory' must be a JSON array of { timestampSeconds }");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("'riderHistory' must be a JSON array of { timestampSeconds }");
  }
  return parsed;
}

function parseCoordinate(raw, name) {
  if (raw === undefined || raw === "") {
    throw new Error(`'${name}' query param is required`);
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`'${name}' must be a number`);
  }
  return value;
}

function serializeStation(station) {
  return {
    id: station.id,
    name: station.name,
    lat: station.lat,
    lon: station.lon,
    distanceMeters: Math.round(station.distanceMeters),
  };
}

// GET /route?originLat=&originLon=&destLat=&destLon=&originLabel=&destLabel=&riderHistory=
//
// Locations arrive as coordinates (resolved client-side via GET /geocode)
// rather than station ids — each end gets snapped to its nearest subway
// station (services/nearestStation.js) before the existing
// station-to-station pathfinding runs. originLabel/destLabel are the
// human-readable text the rider searched for, echoed back for display.
router.get("/", async (req, res) => {
  const {
    originLat: originLatRaw,
    originLon: originLonRaw,
    destLat: destLatRaw,
    destLon: destLonRaw,
    originLabel = "",
    destLabel = "",
    riderHistory: riderHistoryRaw,
  } = req.query;

  let originLat, originLon, destLat, destLon;
  try {
    originLat = parseCoordinate(originLatRaw, "originLat");
    originLon = parseCoordinate(originLonRaw, "originLon");
    destLat = parseCoordinate(destLatRaw, "destLat");
    destLon = parseCoordinate(destLonRaw, "destLon");
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  let riderHistory;
  try {
    riderHistory = parseRiderHistory(riderHistoryRaw);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  let graph;
  try {
    graph = await getGraph();
  } catch (err) {
    console.error("Failed to load station graph:", err);
    return res.status(500).json({ error: "Failed to load station graph" });
  }

  const originStation = findNearestStation(graph, originLat, originLon);
  const destStation = findNearestStation(graph, destLat, destLon);

  if (!originStation || !destStation) {
    return res.status(500).json({ error: "No stations available to route through" });
  }

  if (originStation.id === destStation.id) {
    return res.status(400).json({
      error: `Both locations are closest to the same station (${originStation.name}) — no subway trip needed.`,
    });
  }

  let path;
  try {
    path = shortestPath(graph, originStation.id, destStation.id);
  } catch (err) {
    return res.status(404).json({ error: err.message });
  }

  if (!path) {
    return res
      .status(404)
      .json({ error: `No route found between '${originStation.name}' and '${destStation.name}'` });
  }

  // Dijkstra above optimizes for travel time only — fare rules are
  // layered on top of the resulting segments rather than folded into
  // edge weight (see services/graph.js), so v1 always has exactly one
  // computed path. "fastest" and "cheapest" both label it until a real
  // alternate-route search (e.g. minimizing transfers/fare) is built.
  const fare = calculateFare(path.segments, riderHistory);

  // Segments only carry station ids — the map (phase 9, stretch) needs
  // coordinates for every stop along the path, including transfer stops
  // the rider never typed into the search boxes. The graph already has
  // full station rows in memory, so this is a free lookup rather than an
  // extra DB round trip.
  const stations = {};
  for (const segment of path.segments) {
    for (const stationId of [segment.fromStationId, segment.toStationId]) {
      if (stations[stationId]) continue;
      const node = graph.nodes.get(stationId);
      if (node) {
        stations[stationId] = { name: node.name, lat: node.lat, lon: node.lon, borough: node.borough };
      }
    }
  }

  res.json({
    origin: {
      label: originLabel || originStation.name,
      lat: originLat,
      lon: originLon,
      station: serializeStation(originStation),
    },
    destination: {
      label: destLabel || destStation.name,
      lat: destLat,
      lon: destLon,
      station: serializeStation(destStation),
    },
    stations,
    options: [
      {
        ranks: ["fastest", "cheapest"],
        totalTimeSeconds: path.totalTimeSeconds,
        segments: path.segments,
        fare,
      },
    ],
  });
});

export default router;

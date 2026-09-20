// Builds and queries the in-memory station graph.
//
// Stations and edges are loaded from Postgres once and cached in
// process memory (see getGraph()) — the brief calls this out as a
// "Redis later, in-process cache for v1" tradeoff, and 496 stations /
// ~2200 edges is small enough that a plain adjacency list beats the
// complexity of wiring up Redis this early.
import { pool } from "../db/client.js";

let cachedGraph = null;

// Pure function: rows in, graph out. Kept separate from loadGraph()
// so it can be unit tested / used in scripts without a DB connection.
export function buildGraph(stations, edges) {
  const nodes = new Map();
  for (const s of stations) {
    nodes.set(s.id, s);
  }

  const adjacency = new Map();
  for (const id of nodes.keys()) {
    adjacency.set(id, []);
  }

  for (const e of edges) {
    if (!adjacency.has(e.from_station_id)) {
      adjacency.set(e.from_station_id, []);
    }
    adjacency.get(e.from_station_id).push({
      to: e.to_station_id,
      mode: e.mode,
      line: e.line,
      travelTimeSeconds: e.travel_time_seconds,
      headsign: e.headsign,
    });
  }

  return { nodes, adjacency };
}

export async function loadGraph() {
  const [stationsResult, edgesResult] = await Promise.all([
    pool.query("SELECT id, name, lat, lon, borough FROM stations"),
    pool.query(
      "SELECT from_station_id, to_station_id, mode, line, travel_time_seconds, headsign FROM edges",
    ),
  ]);
  return buildGraph(stationsResult.rows, edgesResult.rows);
}

// Cached singleton so route requests don't hit Postgres on every call.
// forceRefresh is for after a re-ingest, or for long-running processes
// that want to periodically pick up new data.
export async function getGraph({ forceRefresh = false } = {}) {
  if (!cachedGraph || forceRefresh) {
    cachedGraph = await loadGraph();
  }
  return cachedGraph;
}

// Dijkstra shortest-time path between two station ids. Edges already
// encode both subway hops and free/timed transfers as one weighted
// graph, so this is plain single-criterion shortest path — fare rules
// are layered on top of the resulting segment list in a later phase,
// not baked into edge weight here.
//
// Uses a linear scan for the min-distance node rather than a binary
// heap: O(V^2) is ~250k ops for the current ~500-station subway graph,
// which is fast enough for v1. Swap in a heap if/when bus data grows
// the node count enough to matter.
export function shortestPath(graph, fromId, toId) {
  if (!graph.nodes.has(fromId)) {
    throw new Error(`Unknown station id: ${fromId}`);
  }
  if (!graph.nodes.has(toId)) {
    throw new Error(`Unknown station id: ${toId}`);
  }

  const dist = new Map();
  const prev = new Map(); // stationId -> { from, edge }
  const visited = new Set();
  const queue = new Set(graph.nodes.keys());

  for (const id of graph.nodes.keys()) {
    dist.set(id, Infinity);
  }
  dist.set(fromId, 0);

  while (queue.size > 0) {
    let currentId = null;
    let currentDist = Infinity;
    for (const id of queue) {
      const d = dist.get(id);
      if (d < currentDist) {
        currentDist = d;
        currentId = id;
      }
    }

    if (currentId === null) {
      break; // everything left is unreachable
    }
    queue.delete(currentId);
    visited.add(currentId);

    if (currentId === toId) {
      break;
    }

    const neighbors = graph.adjacency.get(currentId) || [];
    for (const edge of neighbors) {
      if (visited.has(edge.to)) continue;
      const candidate = currentDist + edge.travelTimeSeconds;
      if (candidate < dist.get(edge.to)) {
        dist.set(edge.to, candidate);
        prev.set(edge.to, { from: currentId, edge });
      }
    }
  }

  if (dist.get(toId) === Infinity) {
    return null; // no path in the graph
  }

  const segments = [];
  let cursor = toId;
  while (cursor !== fromId) {
    const step = prev.get(cursor);
    segments.unshift({
      fromStationId: step.from,
      toStationId: cursor,
      mode: step.edge.mode,
      line: step.edge.line,
      travelTimeSeconds: step.edge.travelTimeSeconds,
      headsign: step.edge.headsign,
    });
    cursor = step.from;
  }

  return {
    totalTimeSeconds: dist.get(toId),
    segments,
  };
}

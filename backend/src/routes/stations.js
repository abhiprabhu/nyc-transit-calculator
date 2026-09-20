import { Router } from "express";

import { pool } from "../db/client.js";
import { getArrivalsForStation } from "../services/realtimeArrivals.js";

const router = Router();

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 25;

// Escape ILIKE wildcards in user input so a search for e.g. "100%" or
// "a_b" doesn't get interpreted as a SQL LIKE pattern.
function escapeLikePattern(raw) {
  return raw.replace(/[\\%_]/g, "\\$&");
}

function parseLimit(raw) {
  if (!raw) return DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

// GET /stations?q=&limit=
//
// Case-insensitive substring match on station name, ranked so
// prefix matches ("14 st" -> "14 St-Union Sq") sort above matches
// where the query only appears mid-name.
router.get("/", async (req, res) => {
  const { q, limit: limitRaw } = req.query;

  if (q === undefined) {
    return res.status(400).json({ error: "'q' query param is required" });
  }

  const query = q.trim();
  if (!query) {
    return res.json({ query, stations: [] });
  }

  const limit = parseLimit(limitRaw);
  const escaped = escapeLikePattern(query);

  try {
    const result = await pool.query(
      `SELECT id, name, lat, lon, borough
       FROM stations
       WHERE name ILIKE $1 ESCAPE '\\'
       ORDER BY (name ILIKE $2 ESCAPE '\\') DESC, name ASC
       LIMIT $3`,
      [`%${escaped}%`, `${escaped}%`, limit],
    );
    res.json({ query, stations: result.rows });
  } catch (err) {
    console.error("Failed to query stations:", err);
    res.status(500).json({ error: "Failed to query stations" });
  }
});

// GET /stations/:id/arrivals
//
// Live upcoming subway arrivals at a station, from MTA's GTFS-realtime
// feeds (phase 9, stretch). See services/realtimeArrivals.js for the
// feed-grouping and caching details, and its known simplifications.
router.get("/:id/arrivals", async (req, res) => {
  const { id } = req.params;

  const stationResult = await pool.query("SELECT id FROM stations WHERE id = $1", [id]);
  if (stationResult.rows.length === 0) {
    return res.status(404).json({ error: `Unknown station id: ${id}` });
  }

  try {
    const { arrivals, failedFeeds } = await getArrivalsForStation(id);
    res.json({ stationId: id, arrivals, failedFeeds });
  } catch (err) {
    console.error(`Failed to fetch arrivals for station ${id}:`, err);
    res.status(502).json({ error: "Failed to fetch live arrivals from MTA" });
  }
});

export default router;

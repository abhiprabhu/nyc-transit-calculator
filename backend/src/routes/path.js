import { Router } from "express";

import { PATH_STATIONS } from "../data/pathStations.js";
import { getUpcomingArrivals } from "../services/pathRealtime.js";

const router = Router();

// GET /path/stations
//
// The 13 PATH stations this app knows about (see pathStations.js for why
// this is a hardcoded list rather than a DB query — PATH isn't part of the
// route graph/DB yet).
router.get("/stations", (req, res) => {
  res.json({
    stations: PATH_STATIONS.map(({ stopId, name }) => ({ stationId: stopId, name })),
  });
});

// GET /path/arrivals?stationId=X
//
// Next few live PATH arrivals at a station, from the in-memory map that
// services/pathRealtime.js keeps updated via a background poll.
router.get("/arrivals", (req, res) => {
  const { stationId } = req.query;
  if (!stationId) {
    return res.status(400).json({ error: "'stationId' query param is required" });
  }

  const result = getUpcomingArrivals(stationId);
  if (result === null) {
    return res.status(404).json({ error: `Unknown PATH station id: ${stationId}` });
  }

  res.json({ stationId, ...result });
});

export default router;

import { Router } from "express";

import { geocodeSearch } from "../services/geocoding.js";

const router = Router();

// GET /geocode?q=
//
// Free-text location search (addresses, landmarks, neighborhoods) via
// OpenStreetMap Nominatim, restricted to the NYC area. The frontend snaps
// a chosen result to the nearest subway station before routing — see
// routes/route.js.
router.get("/", async (req, res) => {
  const { q } = req.query;

  if (q === undefined) {
    return res.status(400).json({ error: "'q' query param is required" });
  }

  const query = q.trim();
  if (!query) {
    return res.json({ query, locations: [] });
  }

  try {
    const locations = await geocodeSearch(query);
    res.json({ query, locations });
  } catch (err) {
    console.error("Failed to geocode query:", err);
    res.status(502).json({ error: "Failed to look up that location" });
  }
});

export default router;

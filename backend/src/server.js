import express from "express";
import cors from "cors";
import "dotenv/config";

import geocodeRouter from "./routes/geocode.js";
import pathRouter from "./routes/path.js";
import routeRouter from "./routes/route.js";
import stationsRouter from "./routes/stations.js";
import { startPolling as startPathPolling } from "./services/pathRealtime.js";

const app = express();
const PORT = process.env.PORT || 3001;

// CORS_ORIGIN restricts cross-origin requests to the deployed frontend
// (e.g. https://nyc-transit-calculator.vercel.app) in production. Comma-
// separate multiple origins. Unset = allow all, which is fine for local dev.
const allowedOrigins = process.env.CORS_ORIGIN?.split(",").map((origin) => origin.trim());
app.use(cors(allowedOrigins ? { origin: allowedOrigins } : {}));
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/geocode", geocodeRouter);
app.use("/route", routeRouter);
app.use("/stations", stationsRouter);
app.use("/path", pathRouter);

startPathPolling();

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});

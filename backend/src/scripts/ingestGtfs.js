import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ingest } from "../services/gtfsLoader.js";
import { pool } from "../db/client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workDir = path.join(__dirname, "..", "..", "data", "gtfs");

ingest({ feedUrl: process.env.GTFS_SUBWAY_URL, workDir })
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());

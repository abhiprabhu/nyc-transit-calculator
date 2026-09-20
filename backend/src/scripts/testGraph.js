// Manual smoke test for the phase-3 graph engine: loads the real graph
// from Postgres and runs Dijkstra between a few hardcoded station id
// pairs, printing the path so it can be eyeballed against a real map
// before anything is wired up to the /route API (phase 5).
import "dotenv/config";

import { getGraph, shortestPath } from "../services/graph.js";
import { pool } from "../db/client.js";

// A mix of: same-complex transfer, multi-stop same-line ride, and a
// multi-line trip that should involve at least one transfer edge.
const CASES = [
  { label: "Times Sq-42 St -> 14 St-Union Sq (1/2/3 then transfer)", from: "127", to: "635" },
  { label: "Times Sq-42 St -> 34 St-Penn Station (1 train, one stop)", from: "127", to: "128" },
  { label: "Unknown station id (should report no crash, clear error)", from: "127", to: "not-a-real-id" },
];

function formatSegments(segments) {
  return segments
    .map((s) => {
      const via = s.mode === "transfer" ? "transfer" : `${s.line} train`;
      return `  ${s.fromStationId} -> ${s.toStationId}  [${via}, ${s.travelTimeSeconds}s]`;
    })
    .join("\n");
}

async function main() {
  const graph = await getGraph();
  console.log(`Loaded graph: ${graph.nodes.size} stations\n`);

  for (const { label, from, to } of CASES) {
    console.log(`--- ${label} ---`);
    try {
      const result = shortestPath(graph, from, to);
      if (!result) {
        console.log("No path found.\n");
        continue;
      }
      console.log(`Total time: ${result.totalTimeSeconds}s (${result.segments.length} segment(s))`);
      console.log(formatSegments(result.segments));
      console.log();
    } catch (err) {
      console.log(`Error: ${err.message}\n`);
    }
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

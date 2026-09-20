// Snaps a geocoded point (see services/geocoding.js) onto the closest
// subway station in the graph, so routing can stay in station-to-station
// terms once a rider's typed location has been resolved to coordinates.
const EARTH_RADIUS_METERS = 6371000;

function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

export function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a));
}

// Linear scan over every station in the graph — same complexity tradeoff
// as shortestPath's linear min-scan (services/graph.js): fine for ~500
// subway stations, revisit if bus stops get added later.
export function findNearestStation(graph, lat, lon) {
  let nearest = null;
  let nearestDistance = Infinity;

  for (const station of graph.nodes.values()) {
    const distance = haversineDistanceMeters(lat, lon, station.lat, station.lon);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = station;
    }
  }

  if (!nearest) return null;
  return { ...nearest, distanceMeters: nearestDistance };
}

// Free-text location search (e.g. "Times Square" or "350 5th Ave") via
// OpenStreetMap's Nominatim, so riders can search real-world addresses
// instead of knowing subway station names. Results get snapped to the
// nearest subway station in services/nearestStation.js before routing.
//
// Nominatim's usage policy (https://operations.osmfoundation.org/policies/nominatim/)
// caps unauthenticated usage at ~1 request/second and asks for a real
// identifying User-Agent, so requests are throttled to that rate here and
// the identifying string can be overridden via NOMINATIM_USER_AGENT.
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const MIN_REQUEST_GAP_MS = 1000;

// Rough NYC bounding box (west, north, east, south) — keeps results
// relevant to places the subway can actually reach, rather than spending
// the rate-limited quota on out-of-area matches.
const NYC_VIEWBOX = "-74.26,40.92,-73.68,40.49";

let lastRequestAt = 0;
let requestChain = Promise.resolve();

// Chains requests through a single promise so concurrent callers still
// end up spaced at least MIN_REQUEST_GAP_MS apart, rather than each
// racing to check/update lastRequestAt independently.
function throttled(fn) {
  const run = requestChain.then(async () => {
    const wait = Math.max(0, lastRequestAt + MIN_REQUEST_GAP_MS - Date.now());
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequestAt = Date.now();
    return fn();
  });
  requestChain = run.catch(() => {});
  return run;
}

// Nominatim's display_name is the full administrative hierarchy down to
// things like "Manhattan Community Board 5" — accurate, but too noisy for
// a search suggestion. Built from addressdetails instead: a place/POI
// name (falling back to house number + street for addresses with no
// named POI) plus the borough, which is what actually disambiguates NYC
// results from each other.
function shortLabel(result) {
  const { name, address = {} } = result;
  const primary =
    (name && name.trim()) ||
    [address.house_number, address.road].filter(Boolean).join(" ") ||
    result.display_name.split(",")[0].trim();

  const borough = address.suburb || address.city_district || address.city;

  return borough && borough !== primary ? `${primary}, ${borough}` : primary;
}

export async function geocodeSearch(query, { limit = 5 } = {}) {
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    addressdetails: "1",
    limit: String(limit),
    countrycodes: "us",
    viewbox: NYC_VIEWBOX,
    bounded: "1",
  });

  const userAgent = process.env.NOMINATIM_USER_AGENT || "nyc-transit-calculator/1.0";

  const res = await throttled(() =>
    fetch(`${NOMINATIM_URL}?${params}`, { headers: { "User-Agent": userAgent } }),
  );

  if (!res.ok) {
    throw new Error(`Geocoding request failed: ${res.status}`);
  }

  const results = await res.json();
  return results.map((r) => ({
    label: shortLabel(r),
    lat: Number(r.lat),
    lon: Number(r.lon),
  }));
}

// Wraps GET /geocode — free-text location search (addresses, landmarks)
// resolved via OpenStreetMap Nominatim on the backend, see
// backend/src/services/geocoding.js.
import { API_BASE } from './api'

export async function searchLocations(query) {
  const res = await fetch(`${API_BASE}/geocode?q=${encodeURIComponent(query)}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return data.locations
}

// Debounced free-text location search, backed by GET /geocode (OpenStreetMap
// Nominatim on the backend — see backend/src/services/geocoding.js). Nominatim's
// usage policy caps unauthenticated traffic at roughly 1 request/second and asks
// callers not to fire a request per keystroke, so this debounces longer and
// waits for a few characters before searching, on top of the server-side
// throttle.
import { useEffect, useRef, useState } from 'react'

import { searchLocations } from '../lib/geocode'

const DEBOUNCE_MS = 400
const MIN_QUERY_LENGTH = 3

export function useDebouncedGeocode(query) {
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const requestIdRef = useRef(0)

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setSuggestions([])
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    const requestId = ++requestIdRef.current

    const timer = setTimeout(async () => {
      try {
        const locations = await searchLocations(trimmed)
        if (requestId !== requestIdRef.current) return // superseded by a newer query
        setSuggestions(locations)
        setError(null)
      } catch (err) {
        if (requestId !== requestIdRef.current) return
        setSuggestions([])
        setError(err.message)
      } finally {
        if (requestId === requestIdRef.current) setLoading(false)
      }
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [query])

  return { suggestions, loading, error }
}

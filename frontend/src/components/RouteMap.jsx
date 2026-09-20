// Map visualization (phase 9, stretch). Plain Leaflet rather than
// react-leaflet — one imperative map instance per mount is simpler than
// reconciling Leaflet's own DOM management against React's, and it avoids
// pulling in a second dependency just to wrap this.
//
// Uses OpenStreetMap's free tile server (no API key), per the brief's
// stretch-goal note ("Leaflet or Mapbox GL"). Stations are drawn with
// circle markers rather than Leaflet's default pin icon, which sidesteps
// the well-known issue where bundlers break the default icon's relative
// image URLs.
import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

function stationIdsAlongPath(segments) {
  const ids = [segments[0].fromStationId]
  for (const segment of segments) ids.push(segment.toStationId)
  return ids
}

function markerStyle({ isOrigin, isDestination, isTransfer }) {
  if (isOrigin) return { radius: 8, color: '#065f46', fillColor: '#10b981', fillOpacity: 1, weight: 2 }
  if (isDestination) return { radius: 8, color: '#7f1d1d', fillColor: '#ef4444', fillOpacity: 1, weight: 2 }
  if (isTransfer) return { radius: 6, color: '#3730a3', fillColor: '#6366f1', fillOpacity: 1, weight: 2 }
  return { radius: 4, color: '#475569', fillColor: '#94a3b8', fillOpacity: 1, weight: 1 }
}

function RouteMap({ segments, stations }) {
  const containerRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current || !segments || segments.length === 0) return

    const stationIds = stationIdsAlongPath(segments)
    const points = stationIds.map((id) => stations[id]).filter(Boolean)
    if (points.length === 0) return

    const map = L.map(containerRef.current)
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(map)

    const transferStationIds = new Set(
      segments.filter((s) => s.mode === 'transfer').flatMap((s) => [s.fromStationId, s.toStationId]),
    )

    L.polyline(
      points.map((s) => [s.lat, s.lon]),
      { color: '#4f46e5', weight: 4, opacity: 0.8 },
    ).addTo(map)

    stationIds.forEach((id, i) => {
      const station = stations[id]
      if (!station) return

      const isOrigin = i === 0
      const isDestination = i === stationIds.length - 1
      const isTransfer = transferStationIds.has(id)
      const label = isOrigin
        ? `${station.name} (start)`
        : isDestination
          ? `${station.name} (end)`
          : isTransfer
            ? `${station.name} (transfer)`
            : station.name

      L.circleMarker([station.lat, station.lon], markerStyle({ isOrigin, isDestination, isTransfer }))
        .bindPopup(label)
        .addTo(map)
    })

    map.fitBounds(
      points.map((s) => [s.lat, s.lon]),
      { padding: [24, 24] },
    )

    // Leaflet measures its container on init; if that happened while the
    // card was still animating in (or a flex layout hadn't settled), the
    // tile grid can end up sized wrong. One re-measure after paint fixes it.
    const raf = requestAnimationFrame(() => map.invalidateSize())

    return () => {
      cancelAnimationFrame(raf)
      map.remove()
    }
  }, [segments, stations])

  return <div ref={containerRef} className="h-64 w-full rounded-lg sm:h-80" />
}

export default RouteMap

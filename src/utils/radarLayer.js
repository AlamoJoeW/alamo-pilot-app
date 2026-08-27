// NOAA/NWS national radar mosaic overlay (base reflectivity, Multi-Radar
// Multi-Sensor / MRMS composite) — a toggleable layer on the pilot Map tab
// that only refreshes when the pilot explicitly taps it, never on a timer,
// per Joe's request: a pilot should know exactly how stale the image is
// before trusting it for a go/no-go call, not have it silently update
// underneath them.
//
// Source: NOAA's own public ArcGIS "radar_base_reflectivity_time"
// ImageServer — free, no API key, same "official government source" pattern
// as the FAA Class_Airspace FeatureServer (see airspaceLayer.js). It's
// time-enabled and the mosaic updates roughly every 5 minutes; the service's
// own ?f=json metadata always carries the latest available scan time in
// timeInfo.timeExtent[1] (epoch ms), which is what drives the "radar as of
// HH:MM" staleness label in MapView.jsx.
//   Service: https://mapservices.weather.noaa.gov/eventdriven/rest/services/radar/radar_base_reflectivity_time/ImageServer
//   Confirmed live/public 2026-08-27 via its own ?f=json metadata (time-enabled
//   mosaic ImageServer, MRMS-sourced, CONUS+AK+HI+PR+Guam coverage, 5-minute
//   update cadence, 4-hour rolling window).
//
// Rendered with esri-leaflet's L.esri.imageMapLayer (same CDN script already
// loaded for the airspace layer in index.html). Time is pinned via the
// from/to options + setTimeRange() — esri-leaflet's RasterLayer time-range
// API (confirmed against esri-leaflet's own source; ImageMapLayer has no
// setTime() method, only setTimeRange(from, to)) — so the displayed frame
// stays fixed at whatever timestamp fetchLatestRadarTime() last returned
// instead of drifting to "now" on its own between pilot-initiated refreshes.

export const RADAR_SERVICE_URL =
  'https://mapservices.weather.noaa.gov/eventdriven/rest/services/radar/radar_base_reflectivity_time/ImageServer'

// Queries the service's own metadata for the latest available scan time
// rather than assuming "now" — MRMS runs on its own ~5 minute cadence and
// can lag briefly, so this is always the actual most recent frame the
// service has, not a client-side guess.
export async function fetchLatestRadarTime() {
  const res = await fetch(`${RADAR_SERVICE_URL}?f=json`)
  if (!res.ok) throw new Error(`Radar service request failed (${res.status})`)
  const meta = await res.json()
  const extent = meta?.timeInfo?.timeExtent
  if (!extent || extent[1] == null) throw new Error('Radar service has no current scan time')
  return extent[1] // epoch ms
}

// Creates (but does not add to the map) the esri-leaflet ImageMapLayer for
// radar, pinned to `time` (a Date). Returns null if esri-leaflet's CDN
// script hasn't loaded yet — same graceful-degradation pattern as
// createAirspaceLayer(). Callers update the pinned time on refresh via
// layer.setTimeRange(newTime, newTime) rather than recreating the layer.
export function createRadarLayer(time) {
  const L = window.L
  if (!L || !L.esri) return null
  return L.esri.imageMapLayer({
    url: RADAR_SERVICE_URL,
    opacity: 0.55,
    from: time,
    to: time,
  })
}

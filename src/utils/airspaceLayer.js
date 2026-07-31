// FAA Class Airspace overlay (Class B / C / D / Surface E) — a translucent,
// toggleable layer pilots can flip on to see controlled airspace boundaries
// relative to their sites.
//
// Source: FAA Aeronautical Information Services' own public "Class_Airspace"
// ArcGIS Feature Service — no API key, free for public use, republished by
// the FAA every 8-week chart cycle so this always reflects current airspace
// instead of a bundled file going stale. Confirmed live and public 2026-07-31:
//   Item:    https://adds-faa.opendata.arcgis.com/datasets/c6a62360338e408cb1512366ad61559e_0
//   Service: https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/Class_Airspace/FeatureServer/0
//
// Rendered with esri-leaflet's L.esri.featureLayer (loaded via CDN script in
// index.html), which queries only the current map viewport instead of
// pulling the ~300MB nationwide dataset down to the browser.
//
// CLASS field values on this service: B, C, D, E, G. Class E is subdivided
// by LOCAL_TYPE — CLASS_E2 is the surface-based "Class E to the ground"
// area pilots mean by "Surface E" (functions like Class D but without a
// tower). CLASS_E3/E4/E5 are en route/federal-airway/extension shapes,
// deliberately excluded here since they aren't what "Surface E" refers to.
export const AIRSPACE_SERVICE_URL =
  'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/Class_Airspace/FeatureServer/0'

export const AIRSPACE_WHERE = "CLASS IN ('B','C','D') OR LOCAL_TYPE = 'CLASS_E2'"

// Colors follow standard VFR sectional chart convention (solid blue = B,
// solid magenta = C, dashed blue = D, dashed magenta = Surface E) so the
// overlay reads the same way pilots already know from ForeFlight/paper
// charts instead of an arbitrary new color scheme.
const CLASS_STYLE = {
  B:  { color: '#0057b8', dashArray: null,  weight: 2.5, fillOpacity: 0.14 },
  C:  { color: '#c0007f', dashArray: null,  weight: 2.5, fillOpacity: 0.14 },
  D:  { color: '#0057b8', dashArray: '6 4', weight: 2,   fillOpacity: 0.09 },
  E2: { color: '#c0007f', dashArray: '6 4', weight: 2,   fillOpacity: 0.09 },
}

export const AIRSPACE_LEGEND = [
  { key: 'B',  label: 'Class B' },
  { key: 'C',  label: 'Class C' },
  { key: 'D',  label: 'Class D' },
  { key: 'E2', label: 'Surface E' },
]

function styleKeyFor(props) {
  if (!props) return 'D'
  if (props.CLASS === 'B') return 'B'
  if (props.CLASS === 'C') return 'C'
  if (props.LOCAL_TYPE === 'CLASS_E2') return 'E2'
  if (props.CLASS === 'D') return 'D'
  return 'D'
}

function airspaceStyle(feature) {
  const s = CLASS_STYLE[styleKeyFor(feature?.properties)]
  return {
    color: s.color,
    weight: s.weight,
    opacity: 0.9,
    dashArray: s.dashArray,
    fillColor: s.color,
    fillOpacity: s.fillOpacity,
  }
}

function popupHtmlFor(props) {
  const key = styleKeyFor(props)
  const label = key === 'E2' ? 'Class E (Surface)' : `Class ${key}`
  const floor = props.LOWER_CODE === 'SFC'
    ? 'Surface'
    : `${props.LOWER_VAL ?? '?'} ${props.LOWER_UOM || ''}`.trim()
  const ceiling = `${props.UPPER_VAL ?? '?'} ${props.UPPER_UOM || ''}`.trim()
  return `<strong>${props.NAME || label}</strong><br>${label}<br>${floor} – ${ceiling}`
}

// Creates (but does not add to the map) the esri-leaflet FeatureLayer for
// airspace. Returns null if esri-leaflet's CDN script hasn't loaded yet —
// callers should treat that as "feature unavailable" rather than throwing,
// same graceful-degradation pattern as the markercluster fallback in
// MapView.jsx.
export function createAirspaceLayer() {
  const L = window.L
  if (!L || !L.esri) return null
  return L.esri.featureLayer({
    url: AIRSPACE_SERVICE_URL,
    where: AIRSPACE_WHERE,
    simplifyFactor: 0.5,
    precision: 5,
    fields: ['CLASS', 'LOCAL_TYPE', 'NAME', 'LOWER_VAL', 'LOWER_UOM', 'LOWER_CODE', 'UPPER_VAL', 'UPPER_UOM'],
    style: airspaceStyle,
    interactive: true,
  }).bindPopup(feature => popupHtmlFor(feature.properties))
}

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

// Below this zoom, the visible map area is wide enough to span dozens of
// airports at once — and Class D / Surface E exist at nearly every one of
// them nationwide, so a zoomed-out view (the app's default zoom 8) was
// asking esri-leaflet to fetch and render hundreds of overlapping polygon
// shapes as individual SVG paths, which is what made the overlay feel slow
// to load. esri-leaflet's FeatureLayer stops firing queries entirely below
// minZoom (confirmed against esri-leaflet's grid-cell query behavior), and
// MapView.jsx also gates adding the layer to the map on its own zoom
// tracking as a second, library-independent safety net. 9 was picked as the
// zoom where a phone-width view covers roughly one metro area — enough to
// still be useful for a pilot checking their site, small enough to stay fast.
export const AIRSPACE_MIN_ZOOM = 9

// Four clearly different hues (blue / magenta / amber / cyan) so no two classes
// look alike at a glance — the old sectional-chart scheme used blue for both B
// and D and magenta for both C and Surface E, which were hard to tell apart.
// Deliberately NO green anywhere (green would read as "safe/collected" to a pilot),
// and TFRs below are red so they stand out from every class.
const CLASS_STYLE = {
  B:  { color: '#2563eb', dashArray: null,  weight: 2.5, fillOpacity: 0.16 },
  C:  { color: '#d11bd1', dashArray: null,  weight: 2.5, fillOpacity: 0.16 },
  D:  { color: '#f59e0b', dashArray: '6 4', weight: 2.5, fillOpacity: 0.14 },
  E2: { color: '#06b6d4', dashArray: '6 4', weight: 2.5, fillOpacity: 0.14 },
}

// Temporary Flight Restrictions — FAA's current TFR polygons via our /api/tfrs
// proxy. Not zoom-gated (only ~50 nationwide, tiny payload), drawn above the class
// layers. Shape/title only: times and altitudes are in the NOTAM, so the popup
// tells pilots to check it.
export const TFR_STYLE = { color: '#ef4444', weight: 3, opacity: 0.95, fillColor: '#ef4444', fillOpacity: 0.22 }
export const TFR_LEGEND_ITEM = { key: 'TFR', label: 'TFR' }

function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function tfrPopupHtml(props) {
  const title = escapeHtml(props?.TITLE || 'Temporary Flight Restriction')
  const state = props?.STATE ? ` (${escapeHtml(props.STATE)})` : ''
  const notam = props?.NOTAM_KEY ? `<br>NOTAM: ${escapeHtml(props.NOTAM_KEY)}` : ''
  return `<strong>TFR${state}</strong><br>${title}${notam}<br><em>Check the NOTAM for times and altitudes</em>`
}

// Fetches current TFRs and returns a Leaflet GeoJSON layer (not added to the map),
// or null if Leaflet isn't ready / the data can't be loaded. Never throws — a
// failed TFR load should just mean no red shapes, not a broken overlay.
export async function loadTfrLayer(fetchTfrs) {
  const L = window.L
  if (!L) return null
  try {
    const data = await fetchTfrs()
    return L.geoJSON(data, {
      style: () => TFR_STYLE,
      onEachFeature: (feature, layer) => layer.bindPopup(tfrPopupHtml(feature.properties)),
    })
  } catch (err) {
    console.warn('TFR layer unavailable:', err)
    return null
  }
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
    // Higher simplifyFactor = more server-side geometry simplification
    // (fewer vertices returned) before esri-leaflet even draws anything —
    // the biggest lever here besides the zoom gate above, since Class B/C
    // shelf outlines in particular can carry a lot of points.
    simplifyFactor: 1.5,
    precision: 5,
    fields: ['CLASS', 'LOCAL_TYPE', 'NAME', 'LOWER_VAL', 'LOWER_UOM', 'LOWER_CODE', 'UPPER_VAL', 'UPPER_UOM'],
    style: airspaceStyle,
    interactive: true,
    minZoom: AIRSPACE_MIN_ZOOM,
  }).bindPopup(feature => popupHtmlFor(feature.properties))
}

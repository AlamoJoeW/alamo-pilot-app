// On-demand current wind + temperature for a site, pulled from the National
// Weather Service's free api.weather.gov API — no API key, same "official
// government data source" pattern as the FAA airspace overlay (see
// airspaceLayer.js). Deliberately pilot-triggered only (see WeatherCheck in
// SiteDetail.jsx), never prefetched for every pin — the site list runs into
// the thousands, and a background call per marker would hammer the API for
// no reason.
//
// NWS doesn't expose "current conditions at this exact point" — you resolve
// the nearest observation stations for a lat/lng, then read the latest
// observation from the closest one that's actually reporting (stations go
// stale/offline sometimes, so a few are tried in order, nearest first). That
// means the wind/temp shown is really "conditions at the nearest station" —
// usually an airport, sometimes a few to a few dozen miles from a rural
// tower site — which is why the station name is always shown alongside the
// reading rather than implying it's measured exactly at the pin.

const STATION_CACHE = new Map() // "lat,lng" (rounded) -> [{url, name}], resolved once per site per session

function roundCoord(n) {
  return Math.round(Number(n) * 10000) / 10000
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/geo+json' } })
  if (!res.ok) throw new Error(`NWS request failed (${res.status})`)
  return res.json()
}

async function resolveStations(lat, lng) {
  const key = `${roundCoord(lat)},${roundCoord(lng)}`
  if (STATION_CACHE.has(key)) return STATION_CACHE.get(key)

  const point = await fetchJson(`https://api.weather.gov/points/${roundCoord(lat)},${roundCoord(lng)}`)
  const stationsUrl = point?.properties?.observationStations
  if (!stationsUrl) throw new Error('No NWS observation stations found for this location')

  const stationList = await fetchJson(stationsUrl)
  const stations = (stationList?.features || [])
    .map(f => ({ url: f.id, name: f.properties?.name || f.properties?.stationIdentifier }))
    .filter(s => s.url)
  if (stations.length === 0) throw new Error('No NWS observation stations found for this location')

  STATION_CACHE.set(key, stations)
  return stations
}

const cToF = c => (c * 9) / 5 + 32
const kmhToMph = kmh => kmh * 0.621371

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
function compassFor(deg) {
  if (deg === null || deg === undefined) return null
  return COMPASS[Math.round(deg / 22.5) % 16]
}

// Tries stations nearest-first (NWS's own ordering) until one has an actual
// (non-null) temperature reading — plenty of stations report intermittently
// and NWS just returns nulls for whatever they haven't sent recently rather
// than an error, so a missing reading on the first station isn't itself a
// failure.
export async function fetchNwsConditions(lat, lng) {
  if (lat == null || lng == null) throw new Error('Site has no coordinates')
  const stations = await resolveStations(lat, lng)

  let lastErr = null
  for (const station of stations.slice(0, 5)) {
    try {
      const obs = await fetchJson(`${station.url}/observations/latest`)
      const p = obs?.properties
      if (!p || p.temperature?.value === null || p.temperature?.value === undefined) continue

      return {
        tempF: Math.round(cToF(p.temperature.value)),
        windMph: p.windSpeed?.value != null ? Math.round(kmhToMph(p.windSpeed.value)) : null,
        windGustMph: p.windGust?.value != null ? Math.round(kmhToMph(p.windGust.value)) : null,
        windDir: compassFor(p.windDirection?.value),
        stationName: station.name || 'Nearest station',
        obsTime: p.timestamp ? new Date(p.timestamp) : null,
      }
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr || new Error('No recent observation from nearby stations')
}

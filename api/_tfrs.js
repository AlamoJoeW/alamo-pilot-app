import jwt from 'jsonwebtoken'

// (Lives in a file starting with _ so Vercel doesn't count it as its own serverless
// function — the Hobby plan caps a project at 12. It's served through
// GET /api/aircraft?layer=tfrs, see api/aircraft.js.)
//
// Proxy for FAA's public TFR polygons (tfr.faa.gov's own map feed, GeoJSON via WFS).
// The browser asks this route instead of the FAA site directly so we don't depend
// on the FAA allowing cross-origin requests, and so the result can be cached
// briefly instead of every pilot's phone hitting the FAA. The feed has only ~50
// current TFRs nationwide, so we return them all in one small response.
//
// NOTE: this is the FAA website's own data feed, not a formally published API —
// if it changes or goes down, the TFR layer simply doesn't draw (the app handles
// a failed response quietly). Geometry + title only; times/altitudes live in the NOTAM.
const FAA_TFR_URL =
  'https://tfr.faa.gov/geoserver/TFR/ows?service=WFS&version=1.1.0&request=GetFeature' +
  '&typeName=TFR:V_TFR_LOC&outputFormat=application/json&srsname=EPSG:4326'

const CACHE_MS = 15 * 60 * 1000
let cache = { at: 0, body: null }

function verifyToken(req) {
  const auth = req.headers.authorization || ''
  return jwt.verify(auth.replace('Bearer ', ''), process.env.JWT_SECRET)
}

export async function handleTfrs(req, res) {

  try {
    verifyToken(req)
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const now = Date.now()
  if (cache.body && now - cache.at < CACHE_MS) {
    res.setHeader('Cache-Control', 'private, max-age=300')
    return res.json(cache.body)
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10000)
    const faaRes = await fetch(FAA_TFR_URL, { signal: controller.signal })
    clearTimeout(timer)
    if (!faaRes.ok) throw new Error(`FAA TFR feed returned ${faaRes.status}`)
    const data = await faaRes.json()
    if (!data || !Array.isArray(data.features)) throw new Error('Unexpected FAA TFR response')

    // Keep only what the map needs.
    const body = {
      type: 'FeatureCollection',
      features: data.features
        .filter(f => f && f.geometry)
        .map(f => ({
          type: 'Feature',
          geometry: f.geometry,
          properties: {
            TITLE: f.properties?.TITLE || '',
            STATE: f.properties?.STATE || '',
            NOTAM_KEY: f.properties?.NOTAM_KEY || '',
          },
        })),
    }
    cache = { at: now, body }
    res.setHeader('Cache-Control', 'private, max-age=300')
    return res.json(body)
  } catch (err) {
    console.error('tfrs error:', err)
    // Serve a stale copy rather than nothing if we have one.
    if (cache.body) return res.json(cache.body)
    return res.status(502).json({ error: 'TFR data unavailable' })
  }
}

import jwt from 'jsonwebtoken'
import { BASE_ID, API_KEY, TABLES, FIELDS, airtableGetAll } from './_airtable.js'

const PREFLIGHT_TABLE = 'tbl3XS1n9edeDuLOn'

const F = {
  DATE:                'fld3e4DOx5yYCgbYe',
  PILOT:               'fldiapaRvwWUjBC4x',
  TRAVEL_DAY:          'fldkUrdlnzkuw8ML5',
  START_LAT:           'fldAUf6IwteFufphx',
  START_LNG:           'fldF7blLSgdAq9mNz',
  LOCATION_UPDATED_AT: 'fldqHF3twipXfVmc3',
}

function verifyToken(req) {
  const auth = req.headers.authorization || ''
  return jwt.verify(auth.replace('Bearer ', ''), process.env.JWT_SECRET)
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const pilot = verifyToken(req)
    if (!pilot.isAdmin) return res.status(403).json({ error: 'Admin access required' })

    // All active pilots, so the admin view can also show who hasn't checked in today
    const pilotRecords = []
    {
      let offset = null
      do {
        const qs = new URLSearchParams()
        qs.set('returnFieldsByFieldId', 'true')
        qs.set('pageSize', '100')
        qs.append('fields[]', FIELDS.PILOT_FIRST_NAME)
        qs.append('fields[]', FIELDS.PILOT_DISPLAY_NAME)
        if (offset) qs.set('offset', offset)
        const url = `https://api.airtable.com/v0/${BASE_ID}/${TABLES.PILOTS}?${qs}`
        const r = await fetch(url, { headers: { Authorization: `Bearer ${API_KEY}` } })
        if (!r.ok) throw new Error(`Airtable GET error ${r.status}: ${await r.text()}`)
        const data = await r.json()
        pilotRecords.push(...data.records)
        offset = data.offset || null
      } while (offset)
    }

    // Today's preflight records across all pilots
    const todayStr = today()
    const filter = "DATESTR({" + F.DATE + "})='" + todayStr + "'"
    const preflights = await airtableGetAll(
      PREFLIGHT_TABLE,
      filter,
      [F.PILOT, F.TRAVEL_DAY, F.START_LAT, F.START_LNG, F.LOCATION_UPDATED_AT]
    )

    const locationByPilotId = {}
    preflights.forEach(rec => {
      const ids = rec.fields[F.PILOT] || []
      ids.forEach(pilotId => {
        locationByPilotId[pilotId] = {
          lat: rec.fields[F.START_LAT] ?? null,
          lng: rec.fields[F.START_LNG] ?? null,
          updatedAt: rec.fields[F.LOCATION_UPDATED_AT] || null,
          travelDay: rec.fields[F.TRAVEL_DAY] || false,
        }
      })
    })

    const pilots = pilotRecords.map(r => {
      const name = (r.fields[FIELDS.PILOT_DISPLAY_NAME] || r.fields[FIELDS.PILOT_FIRST_NAME] || '').trim()
      const loc = locationByPilotId[r.id] || null
      return {
        pilotId: r.id,
        name: name || 'Unnamed',
        hasPreflightToday: !!loc,
        lat: loc?.lat ?? null,
        lng: loc?.lng ?? null,
        updatedAt: loc?.updatedAt ?? null,
        travelDay: loc?.travelDay ?? false,
      }
    })

    return res.json({ pilots, asOf: new Date().toISOString() })
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    console.error('pilot-locations error:', err)
    return res.status(500).json({ error: err.message || 'Internal server error' })
  }
}

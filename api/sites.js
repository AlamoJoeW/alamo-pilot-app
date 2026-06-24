import jwt from 'jsonwebtoken'
import { BASE_ID, API_KEY, TABLES, FIELDS, SITE_FIELDS } from './_airtable.js'

const VIEW_NAME = 'Verizon vHive All for KMLs'

// Safely extract a string from a field that may be a linked record array, object, or primitive
function str(val) {
  if (val == null) return ''
  if (Array.isArray(val)) return val.map(v => (v && typeof v === 'object' ? v.name || v.id || '' : String(v))).filter(Boolean).join(', ')
  if (typeof val === 'object') return val.name || val.id || ''
  return String(val)
}

function verifyToken(req) {
  const auth = req.headers.authorization || ''
  return jwt.verify(auth.replace('Bearer ', ''), process.env.JWT_SECRET)
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const pilot = verifyToken(req)

    const records = []
    let offset = null

    do {
      const qs = new URLSearchParams()
      qs.set('returnFieldsByFieldId', 'true')
      qs.set('view', VIEW_NAME)
      qs.set('pageSize', '100')
      SITE_FIELDS.forEach(f => qs.append('fields[]', f))
      if (offset) qs.set('offset', offset)

      const url = `https://api.airtable.com/v0/${BASE_ID}/${TABLES.COLLECTION_ASSETS}?${qs}`
      const r = await fetch(url, { headers: { Authorization: `Bearer ${API_KEY}` } })
      if (!r.ok) {
        const err = await r.text()
        throw new Error(`Airtable GET error ${r.status}: ${err}`)
      }
      const data = await r.json()
      records.push(...data.records)
      offset = data.offset || null
    } while (offset)

    // Filter to only sites assigned to the logged-in pilot.
    // PILOT_APP is a linked record field; the API returns an array of pilot record IDs.
    const pilotRecords = records.filter(r =>
      (r.fields[FIELDS.PILOT_APP] || []).includes(pilot.pilotRecordId)
    )

    const sites = pilotRecords.map(r => ({
      id: r.id,
      siteId:              str(r.fields[FIELDS.SITE_ID]),
      fuzeId:              str(r.fields[FIELDS.FUZE_ID]),
      collectionStatus:    str(r.fields[FIELDS.COLLECTION_STATUS]),
      siteIssue:           str(r.fields[FIELDS.SITE_ISSUE]),
      pilotAssigned:       str(r.fields[FIELDS.PILOT_ASSIGNED]),
      pilotApp:            r.fields[FIELDS.PILOT_APP]            || [],
      subProject:          str(r.fields[FIELDS.SUB_PROJECT]),
      address:             str(r.fields[FIELDS.ADDRESS]),
      city:                str(r.fields[FIELDS.CITY]),
      state:               str(r.fields[FIELDS.STATE]),
      zip:                 str(r.fields[FIELDS.ZIP]),
      siteStructureType:   str(r.fields[FIELDS.SITE_STRUCTURE_TYPE]),
      structureHeight:     str(r.fields[FIELDS.STRUCTURE_HEIGHT]),
      airport:             str(r.fields[FIELDS.AIRPORT]),
      airspace:            str(r.fields[FIELDS.AIRSPACE]),
      lat:                 r.fields[FIELDS.LATITUDE]             ?? null,
      lng:                 r.fields[FIELDS.LONGITUDE]            ?? null,
      dateAdded:           str(r.fields[FIELDS.DATE_ADDED]),
      mapColor:            str(r.fields[FIELDS.MAP_COLOR]),
      siteStructureOwner:  str(r.fields[FIELDS.SITE_STRUCTURE_OWNER]),
      mobFee:              r.fields[FIELDS.MOB_FEE]              || false,
      partialCollection:   r.fields[FIELDS.PARTIAL_COLLECTION]   || false,
      collectedApp:        r.fields[FIELDS.COLLECTED_APP]        || false,
    }))

    return res.json({ sites, syncedAt: new Date().toISOString() })
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    console.error('sites error:', err)
    return res.status(500).json({ error: err.message || 'Internal server error' })
  }
}

import jwt from 'jsonwebtoken'
import { BASE_ID, API_KEY, TABLES, FIELDS, SITE_FIELDS } from './_airtable.js'

const VIEW_NAME = 'Verizon vHive All for KMLs'

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
      siteId:              r.fields[FIELDS.SITE_ID]              || '',
      fuzeId:              r.fields[FIELDS.FUZE_ID]              || '',
      collectionStatus:    r.fields[FIELDS.COLLECTION_STATUS]    || '',
      siteIssue:           Array.isArray(r.fields[FIELDS.SITE_ISSUE]) ? r.fields[FIELDS.SITE_ISSUE].map(v => (v && typeof v === 'object' ? v.value : v)).filter(Boolean).join(', ') : (r.fields[FIELDS.SITE_ISSUE] || ''),
      pilotAssigned:       r.fields[FIELDS.PILOT_ASSIGNED]       || '',
      pilotApp:            r.fields[FIELDS.PILOT_APP]            || [],
      subProject:          r.fields[FIELDS.SUB_PROJECT]          || '',
      address:             r.fields[FIELDS.ADDRESS]              || '',
      city:                r.fields[FIELDS.CITY]                 || '',
      state:               r.fields[FIELDS.STATE]                || '',
      zip:                 r.fields[FIELDS.ZIP]                  || '',
      siteStructureType:   r.fields[FIELDS.SITE_STRUCTURE_TYPE]  || '',
      structureHeight:     r.fields[FIELDS.STRUCTURE_HEIGHT]     || '',
      airport:             r.fields[FIELDS.AIRPORT]              || '',
      airspace:            r.fields[FIELDS.AIRSPACE]             || '',
      lat:                 r.fields[FIELDS.LATITUDE]             ?? null,
      lng:                 r.fields[FIELDS.LONGITUDE]            ?? null,
      dateAdded:           r.fields[FIELDS.DATE_ADDED]           || '',
      mapColor:            r.fields[FIELDS.MAP_COLOR]            || '',
      siteStructureOwner:  r.fields[FIELDS.SITE_STRUCTURE_OWNER] || '',
      mobFee:              r.fields[FIELDS.MOB_FEE]              || false,
      partialCollection:   r.fields[FIELDS.PARTIAL_COLLECTION]   || false,
      collectedApp:        r.fields[FIELDS.COLLECTED_APP]        || false,
      coaAttachments:      r.fields[FIELDS.COA]                  || [],
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

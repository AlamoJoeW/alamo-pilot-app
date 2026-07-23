import jwt from 'jsonwebtoken'
import { BASE_ID, API_KEY, TABLES, FIELDS, SITE_FIELDS, airtableGetAll } from './_airtable.js'

// Combined admin endpoint — returns both all-pilot sites and today's pilot locations
// in a single response. Kept as one file (rather than two) to stay under Vercel's
// Hobby-plan 12-serverless-function cap.

const VIEW_NAME = 'Verizon vHive All for KMLs'
const PREFLIGHT_TABLE = 'tbl3XS1n9edeDuLOn'

const PF = {
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

async function fetchAllPilots() {
  const records = []
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
    records.push(...data.records)
    offset = data.offset || null
  } while (offset)
  return records
}

async function fetchAllSites() {
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
    if (!r.ok) throw new Error(`Airtable GET error ${r.status}: ${await r.text()}`)
    const data = await r.json()
    records.push(...data.records)
    offset = data.offset || null
  } while (offset)
  return records
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const pilot = verifyToken(req)
    if (!pilot.isAdmin) return res.status(403).json({ error: 'Admin access required' })

    const [siteRecords, pilotRecords, preflights] = await Promise.all([
      fetchAllSites(),
      fetchAllPilots(),
      airtableGetAll(
        PREFLIGHT_TABLE,
        "DATESTR({" + PF.DATE + "})='" + today() + "'",
        [PF.PILOT, PF.TRAVEL_DAY, PF.START_LAT, PF.START_LNG, PF.LOCATION_UPDATED_AT]
      ),
    ])

    const pilotNameById = {}
    pilotRecords.forEach(rec => {
      const name = (rec.fields[FIELDS.PILOT_DISPLAY_NAME] || rec.fields[FIELDS.PILOT_FIRST_NAME] || '').trim()
      pilotNameById[rec.id] = name || 'Unassigned'
    })

    const sites = siteRecords.map(r => {
      const pilotIds = r.fields[FIELDS.PILOT_APP] || []
      return {
        id: r.id,
        siteId:              r.fields[FIELDS.SITE_ID]              || '',
        fuzeId:              r.fields[FIELDS.FUZE_ID]              || '',
        collectionStatus:    r.fields[FIELDS.COLLECTION_STATUS]    || '',
        siteIssue:           Array.isArray(r.fields[FIELDS.SITE_ISSUE]) ? r.fields[FIELDS.SITE_ISSUE].map(v => (v && typeof v === 'object' ? v.value : v)).filter(Boolean).join(', ') : (r.fields[FIELDS.SITE_ISSUE] || ''),
        pilotAssigned:       r.fields[FIELDS.PILOT_ASSIGNED]       || '',
        pilotApp:            pilotIds,
        pilotNames:          pilotIds.map(id => pilotNameById[id] || id),
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
      }
    })

    const locationByPilotId = {}
    preflights.forEach(rec => {
      const ids = rec.fields[PF.PILOT] || []
      ids.forEach(pilotId => {
        locationByPilotId[pilotId] = {
          lat: rec.fields[PF.START_LAT] ?? null,
          lng: rec.fields[PF.START_LNG] ?? null,
          updatedAt: rec.fields[PF.LOCATION_UPDATED_AT] || null,
          travelDay: rec.fields[PF.TRAVEL_DAY] || false,
        }
      })
    })

    const pilots = pilotRecords.map(r => {
      const loc = locationByPilotId[r.id] || null
      return {
        pilotId: r.id,
        name: pilotNameById[r.id] || 'Unnamed',
        hasPreflightToday: !!loc,
        lat: loc?.lat ?? null,
        lng: loc?.lng ?? null,
        updatedAt: loc?.updatedAt ?? null,
        travelDay: loc?.travelDay ?? false,
      }
    })

    return res.json({ sites, pilots, asOf: new Date().toISOString() })
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    console.error('admin error:', err)
    return res.status(500).json({ error: err.message || 'Internal server error' })
  }
}

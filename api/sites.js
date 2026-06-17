import jwt from 'jsonwebtoken'
import { airtableGetAll, TABLES, SITE_FIELDS, FIELDS } from './_airtable.js'

function verifyToken(req) {
  const auth = req.headers.authorization || ''
  const token = auth.replace('Bearer ', '')
  if (!token) throw new Error('No token')
  return jwt.verify(token, process.env.JWT_SECRET)
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  try {
    const pilot = verifyToken(req)
    const { firstName } = pilot

    if (!firstName) {
      return res.status(400).json({ error: 'Pilot name not found in token' })
    }

    // Fetch remaining sites for this pilot using the "google maps Remaining" view,
    // which is filtered daily to exclude already-collected sites.
    const formula = `{${FIELDS.PILOT_ASSIGNED}}="${firstName}"`
    const records = await airtableGetAll(
      TABLES.COLLECTION_ASSETS,
      formula,
      SITE_FIELDS,
      'google maps Remaining'
    )

    // Normalize records for the app
    const sites = records.map(r => ({
      id: r.id,
      siteId: r.fields[FIELDS.SITE_ID] || '',
      fuzeId: r.fields[FIELDS.FUZE_ID] || '',
      collectionStatus: r.fields[FIELDS.COLLECTION_STATUS] || '',
      // Site Issue is a lookup of AI summaries from linked Access Issue records.
      // Airtable returns an array of {state, value, isStale} objects — extract .value.
      siteIssue: (() => {
        const raw = r.fields[FIELDS.SITE_ISSUE]
        if (!raw || !Array.isArray(raw)) return ''
        return raw
          .map(v => (v && typeof v === 'object') ? (v.value || '') : String(v || ''))
          .filter(Boolean)
          .join(' | ')
      })(),
      pilotAssigned: r.fields[FIELDS.PILOT_ASSIGNED] || '',
      subProject: r.fields[FIELDS.SUB_PROJECT] || '',
      address: r.fields[FIELDS.ADDRESS] || '',
      city: r.fields[FIELDS.CITY] || '',
      state: r.fields[FIELDS.STATE] || '',
      zip: r.fields[FIELDS.ZIP] || '',
      siteStructureType: r.fields[FIELDS.SITE_STRUCTURE_TYPE] || '',
      structureHeight: r.fields[FIELDS.STRUCTURE_HEIGHT] || '',
      airport: r.fields[FIELDS.AIRPORT] || '',
      airspace: r.fields[FIELDS.AIRSPACE] || '',
      lat: r.fields[FIELDS.LATITUDE] || null,
      lng: r.fields[FIELDS.LONGITUDE] || null,
      dateAdded: r.fields[FIELDS.DATE_ADDED] || '',
      mapColor: r.fields[FIELDS.MAP_COLOR]?.name || '',
      siteStructureOwner: r.fields[FIELDS.SITE_STRUCTURE_OWNER] || '',
      mobFee: !!r.fields[FIELDS.MOB_FEE],
      partialCollection: !!r.fields[FIELDS.PARTIAL_COLLECTION],
      collectedApp: !!r.fields[FIELDS.COLLECTED_APP],
    }))

    res.json({ sites, syncedAt: new Date().toISOString() })
  } catch (err) {
    console.error('Sites error:', err)
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    res.status(500).json({ error: 'Server error' })
  }
}

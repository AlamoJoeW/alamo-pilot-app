import jwt from 'jsonwebtoken'
import { airtableGet, airtablePost, airtableGetAll, TABLES, FIELDS, centralDateStr } from './_airtable.js'
import { PREFLIGHT_TABLE, F as PREFLIGHT_FIELDS } from './preflight.js'

function verifyToken(req) {
  const auth = req.headers.authorization || ''
  return jwt.verify(auth.replace('Bearer ', ''), process.env.JWT_SECRET)
}

export default async function handler(req, res) {
  // GET — return today's EOD summary if one exists
  if (req.method === 'GET') {
    try {
      const pilot = verifyToken(req)
      const today = centralDateStr() // see _airtable.js — Central time, not server UTC
      const formula = `AND({${FIELDS.EOD_DATE}}="${today}", FIND("${pilot.pilotRecordId}", ARRAYJOIN({${FIELDS.EOD_PILOT}})))`
      const data = await airtableGet(TABLES.EOD_REPORTS, {
        filterByFormula: formula,
        fields: [FIELDS.EOD_DATE, FIELDS.EOD_FULL_COLLECTION, FIELDS.EOD_PARTIAL_COLLECTION, FIELDS.EOD_MOBILIZATION],
        pageSize: 1,
      })
      const eod = data.records?.[0]
      if (!eod) return res.json({ eodId: null, date: today, submitted: false })
      res.json({
        eodId: eod.id,
        date: today,
        submitted: true,
        fullCount: (eod.fields[FIELDS.EOD_FULL_COLLECTION] || []).length,
        partialCount: (eod.fields[FIELDS.EOD_PARTIAL_COLLECTION] || []).length,
        mobCount: (eod.fields[FIELDS.EOD_MOBILIZATION] || []).length,
      })
    } catch (err) {
      console.error('EOD GET error:', err)
      if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Unauthorized' })
      }
      res.status(500).json({ error: err.message || 'Server error' })
    }
    return
  }

  // POST — create a new EOD record with today's collected sites
  if (req.method === 'POST') {
    try {
      const pilot = verifyToken(req)
      const today = centralDateStr() // see _airtable.js — Central time, not server UTC
      const {
        collectedIds = [], partialIds = [], mobIds = [], reflyIds = [],
        projectId, preflightId, fullCount, partialCount,
        endLat, endLng, eodForm = {},
      } = req.body || {}

      // Validate pilot record ID — missing ID sends [{}] to Airtable which causes a silent rejection
      if (!pilot.pilotRecordId || typeof pilot.pilotRecordId !== 'string') {
        return res.status(400).json({ error: 'Pilot record ID missing from token. Please log out and log back in.' })
      }

      // Validate all site record IDs look like Airtable IDs
      const isValidId = id => typeof id === 'string' && id.startsWith('rec') && id.length === 17
      const invalidIds = [...collectedIds, ...partialIds, ...mobIds, ...reflyIds].filter(id => !isValidId(id))
      if (invalidIds.length > 0) {
        return res.status(400).json({ error: `Invalid site record ID(s): ${invalidIds.join(', ')}` })
      }

      // Airtable linked record fields accept plain record ID strings, not {id:} objects
      const fields = {
        [FIELDS.EOD_DATE]: today,
        [FIELDS.EOD_PILOT]: [pilot.pilotRecordId],
      }
      if (collectedIds.length > 0) {
        fields[FIELDS.EOD_FULL_COLLECTION] = collectedIds
      }
      if (partialIds.length > 0) {
        fields[FIELDS.EOD_PARTIAL_COLLECTION] = partialIds
      }
      if (mobIds.length > 0) {
        fields[FIELDS.EOD_MOBILIZATION] = mobIds
      }
      if (reflyIds.length > 0) {
        fields[FIELDS.EOD_REFLYS_SITES] = reflyIds
      }
      if (fullCount != null && !isNaN(Number(fullCount))) {
        fields[FIELDS.EOD_FULL_COUNT] = Number(fullCount)
      }
      if (partialCount != null && !isNaN(Number(partialCount))) {
        fields[FIELDS.EOD_PARTIAL_COUNT] = Number(partialCount)
      }
      if (projectId && isValidId(projectId)) {
        fields[FIELDS.EOD_PROJECT] = [projectId]
      }
      // Resolve today's Preflight record server-side by pilot record ID,
      // rather than trusting the client-supplied `preflightId`. That value
      // is cached React state (App.jsx's checkAndSetPreflight), set once at
      // login or when a pilot taps "I've Submitted It" — if a pilot
      // completes today's Preflight (external Airtable form) *after* the
      // app already loaded and never re-triggers that check, the app can
      // submit the EOD with a stale/missing preflightId. The EOD record
      // still gets created (looks "submitted" to the pilot), but its
      // Preflight link comes up empty — which is exactly what the
      // 9pm/11pm/1am "MISSING END OF DAY REPORT" Airtable automations check
      // (they filter the Preflight table's own "End of Day Reports" field
      // for isEmpty), so pilots who did submit still get nagged. Matching
      // by pilot.pilotRecordId (not name) also sidesteps any display-name
      // formatting mismatch between the Pilots table and today's Preflight
      // record.
      let resolvedPreflightId = null
      try {
        const pfFilter = `DATESTR({${PREFLIGHT_FIELDS.DATE}})="${today}"`
        const pfRecords = await airtableGetAll(PREFLIGHT_TABLE, pfFilter, [PREFLIGHT_FIELDS.PILOT])
        const match = pfRecords.find(r => (r.fields[PREFLIGHT_FIELDS.PILOT] || []).includes(pilot.pilotRecordId))
        if (match) resolvedPreflightId = match.id
      } catch (err) {
        console.error('EOD preflight resolve error:', err)
      }
      const finalPreflightId = resolvedPreflightId || (preflightId && isValidId(preflightId) ? preflightId : null)
      if (finalPreflightId) {
        fields[FIELDS.EOD_PREFLIGHT] = [finalPreflightId]
      }
      if (endLat != null && !isNaN(Number(endLat))) {
        fields[FIELDS.EOD_END_LAT] = Number(endLat)
      }
      if (endLng != null && !isNaN(Number(endLng))) {
        fields[FIELDS.EOD_END_LNG] = Number(endLng)
      }

      // Fields mirroring the live Airtable "End of Day Report" form's own logic
      // (see src/components/EODReport.jsx for the matching in-app steps).
      if (eodForm.reflightsYN) {
        fields[FIELDS.EOD_REFLIGHTS_YN] = eodForm.reflightsYN
      }
      if (eodForm.reflysCount != null && !isNaN(Number(eodForm.reflysCount))) {
        fields[FIELDS.EOD_REFLYS_COUNT] = Number(eodForm.reflysCount)
      }
      if (eodForm.reflysNotes) {
        fields[FIELDS.EOD_REFLYS_NOTES] = eodForm.reflysNotes
      }
      if (eodForm.visitedUncollectedYN) {
        fields[FIELDS.EOD_VISITED_UNCOLLECTED_YN] = eodForm.visitedUncollectedYN
      }
      if (eodForm.mobNotes) {
        fields[FIELDS.EOD_MOB_NOTES] = eodForm.mobNotes
      }
      if (eodForm.zeroCollectionsNotes) {
        fields[FIELDS.EOD_ZERO_COLLECTIONS_NOTES] = eodForm.zeroCollectionsNotes
      }
      if (eodForm.generalNotes) {
        fields[FIELDS.EOD_GENERAL_NOTES] = eodForm.generalNotes
      }
      if (eodForm.airdataSynced) {
        fields[FIELDS.EOD_AIRDATA_SYNC] = eodForm.airdataSynced
      }

      const result = await airtablePost(TABLES.EOD_REPORTS, fields)

      res.json({
        success: true,
        eodId: result.id,
        date: today,
        fullCount: collectedIds.length,
        partialCount: partialIds.length,
        mobCount: mobIds.length,
      })
    } catch (err) {
      console.error('EOD POST error:', err)
      if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Unauthorized' })
      }
      res.status(500).json({ error: err.message || 'EOD submission failed — check server logs' })
    }
    return
  }

  res.status(405).end()
}

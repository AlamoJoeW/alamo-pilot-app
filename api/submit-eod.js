import jwt from 'jsonwebtoken'
import { airtableGet, airtablePost, TABLES, FIELDS } from './_airtable.js'

function verifyToken(req) {
  const auth = req.headers.authorization || ''
  return jwt.verify(auth.replace('Bearer ', ''), process.env.JWT_SECRET)
}

export default async function handler(req, res) {
  // GET — return today's EOD summary if one exists
  if (req.method === 'GET') {
    try {
      const pilot = verifyToken(req)
      const today = new Date().toISOString().split('T')[0]
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
      const today = new Date().toISOString().split('T')[0]
      const { collectedIds = [], partialIds = [], mobIds = [], projectId, fullCount, partialCount } = req.body || {}

      // Validate pilot record ID — missing ID sends [{}] to Airtable which causes a silent rejection
      if (!pilot.pilotRecordId || typeof pilot.pilotRecordId !== 'string') {
        return res.status(400).json({ error: 'Pilot record ID missing from token. Please log out and log back in.' })
      }

      // Validate all site record IDs look like Airtable IDs
      const isValidId = id => typeof id === 'string' && id.startsWith('rec') && id.length === 17
      const invalidIds = [...collectedIds, ...partialIds, ...mobIds].filter(id => !isValidId(id))
      if (invalidIds.length > 0) {
        return res.status(400).json({ error: `Invalid site record ID(s): ${invalidIds.join(', ')}` })
      }

      const fields = {
        [FIELDS.EOD_DATE]: today,
        [FIELDS.EOD_PILOT]: [{ id: pilot.pilotRecordId }],
      }
      if (collectedIds.length > 0) {
        fields[FIELDS.EOD_FULL_COLLECTION] = collectedIds.map(id => ({ id }))
      }
      if (partialIds.length > 0) {
        fields[FIELDS.EOD_PARTIAL_COLLECTION] = partialIds.map(id => ({ id }))
      }
      if (mobIds.length > 0) {
        fields[FIELDS.EOD_MOBILIZATION] = mobIds.map(id => ({ id }))
      }
      if (fullCount != null && !isNaN(Number(fullCount))) {
        fields[FIELDS.EOD_FULL_COUNT] = Number(fullCount)
      }
      if (partialCount != null && !isNaN(Number(partialCount))) {
        fields[FIELDS.EOD_PARTIAL_COUNT] = Number(partialCount)
      }
      // Only include projectId if it looks like a valid Airtable record ID
      if (projectId && isValidId(projectId)) {
        fields[FIELDS.EOD_PROJECT] = [{ id: projectId }]
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

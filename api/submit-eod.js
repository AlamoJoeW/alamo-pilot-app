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
      const formula = `AND({${FIELDS.EOD_DATE}}="${today}", FIND("${pilot.pilotRecordId}", ARRAYJOIN(${FIELDS.EOD_PILOT})))`
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
      res.status(500).json({ error: 'Server error' })
    }
    return
  }

  // POST — create a new EOD record
  if (req.method === 'POST') {
    try {
      const pilot = verifyToken(req)
      const today = new Date().toISOString().split('T')[0]
      const { collectedIds = [], partialIds = [], mobIds = [], projectId } = req.body || {}

      // Defensive: handle legacy JWTs where pilotRecordId may be a full record object
      const pilotId = typeof pilot.pilotRecordId === 'string'
        ? pilot.pilotRecordId
        : (pilot.pilotRecordId?.id || '')

      const fields = {
        [FIELDS.EOD_DATE]: today,
        [FIELDS.EOD_PILOT]: [{ id: pilotId }],
      }
      if (collectedIds.length > 0) {
        fields[FIELDS.EOD_FULL_COLLECTION] = collectedIds.map(id => ({ id: String(id) }))
      }
      if (partialIds.length > 0) {
        fields[FIELDS.EOD_PARTIAL_COLLECTION] = partialIds.map(id => ({ id: String(id) }))
      }
      if (mobIds.length > 0) {
        fields[FIELDS.EOD_MOBILIZATION] = mobIds.map(id => ({ id: String(id) }))
      }
      if (projectId) {
        fields[FIELDS.EOD_PROJECT] = [{ id: String(projectId) }]
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
      res.status(500).json({ error: 'Server error' })
    }
    return
  }

  res.status(405).end()
}

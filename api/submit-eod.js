import jwt from 'jsonwebtoken'
import { airtableGetAll, airtablePost, airtablePatch, TABLES, FIELDS } from './_airtable.js'

// Preflight table constant (not yet in _airtable.js TABLES â add when merging)
const PREFLIGHT_TABLE = 'tbl3XS1n9edeDuLOn'

function verifyToken(req) {
  const auth = req.headers.authorization || ''
  return jwt.verify(auth.replace('Bearer ', ''), process.env.JWT_SECRET)
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

export default async function handler(req, res) {
  try {
    const pilot = verifyToken(req)

    // GET â check if pilot already submitted EOD today
    if (req.method === 'GET') {
      const filter = `AND({${FIELDS.EOD_DATE}}='${today()}', FIND('${pilot.pilotRecordId}', ARRAYJOIN({${FIELDS.EOD_PILOT}})))`
      const records = await airtableGetAll(TABLES.EOD_REPORTS, filter, [
        FIELDS.EOD_DATE,
        FIELDS.EOD_PILOT,
        FIELDS.EOD_FULL_COLLECTION,
        FIELDS.EOD_PARTIAL_COLLECTION,
        FIELDS.EOD_MOBILIZATION,
      ])
      if (!records.length) return res.json({ exists: false })
      const rec = records[0]
      return res.json({
        exists: true,
        eodId: rec.id,
        collected: rec.fields[FIELDS.EOD_FULL_COLLECTION] || [],
        partial: rec.fields[FIELDS.EOD_PARTIAL_COLLECTION] || [],
        mob: rec.fields[FIELDS.EOD_MOBILIZATION] || [],
      })
    }

    // POST â submit EOD
    if (req.method === 'POST') {
      const { collectedIds = [], partialIds = [], mobIds = [], endLat, endLng, preflightId } = req.body

      const fields = {
        [FIELDS.EOD_DATE]:  today(),
        [FIELDS.EOD_PILOT]: [{ id: pilot.pilotRecordId }],
      }

      if (collectedIds.length) fields[FIELDS.EOD_FULL_COLLECTION] = collectedIds.map(id => ({ id }))
      if (partialIds.length)   fields[FIELDS.EOD_PARTIAL_COLLECTION]   = partialIds.map(id => ({ id }))
      if (mobIds.length)       fields[FIELDS.EOD_MOBILIZATION]       = mobIds.map(id => ({ id }))
      if (endLat != null)      fields[FIELDS.EOD_END_LAT]   = endLat
      if (endLng != null)      fields[FIELDS.EOD_END_LNG]   = endLng

      const result = await airtablePost(TABLES.EOD_REPORTS, fields)

      // Link EOD back to the preflight record if provided
      if (preflightId) {
        await airtablePatch(PREFLIGHT_TABLE, preflightId, {
          [FIELDS.PREFLIGHT_EOD_LINK]: [{ id: result.id }],
        })
      }

      return res.json({ success: true, eodId: result.id })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    console.error('submit-eod-v2 error:', err)
    return res.status(500).json({ error: err.message || 'Internal server error' })
  }
}

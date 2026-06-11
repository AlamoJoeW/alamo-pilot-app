import jwt from 'jsonwebtoken'
import { airtableGet, TABLES, FIELDS } from './_airtable.js'

function verifyToken(req) {
  const auth = req.headers.authorization || ''
  return jwt.verify(auth.replace('Bearer ', ''), process.env.JWT_SECRET)
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()

  try {
    const pilot = verifyToken(req)
    const today = new Date().toISOString().split('T')[0]

    const formula = `AND({${FIELDS.EOD_DATE}}="${today}", FIND("${pilot.pilotRecordId}", ARRAYJOIN(${FIELDS.EOD_PILOT})))`
    const data = await airtableGet(TABLES.EOD_REPORTS, {
      filterByFormula: formula,
      fields: [
        FIELDS.EOD_DATE,
        FIELDS.EOD_FULL_COLLECTION,
        FIELDS.EOD_PARTIAL_COLLECTION,
        FIELDS.EOD_MOBILIZATION,
      ],
      pageSize: 1,
    })

    const eod = data.records?.[0]
    if (!eod) {
      return res.json({
        eodId: null,
        date: today,
        fullCount: 0,
        partialCount: 0,
        mobCount: 0,
        message: 'No EOD report for today yet',
      })
    }

    const fullCount = (eod.fields[FIELDS.EOD_FULL_COLLECTION] || []).length
    const partialCount = (eod.fields[FIELDS.EOD_PARTIAL_COLLECTION] || []).length
    const mobCount = (eod.fields[FIELDS.EOD_MOBILIZATION] || []).length

    res.json({
      eodId: eod.id,
      date: today,
      fullCount,
      partialCount,
      mobCount,
      airtableUrl: `https://airtable.com/app3uLCFgt3Y0aPaa/${TABLES.EOD_REPORTS}/${eod.id}`,
    })
  } catch (err) {
    console.error('Submit EOD error:', err)
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    res.status(500).json({ error: 'Server error' })
  }
}

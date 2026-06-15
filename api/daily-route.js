import jwt from 'jsonwebtoken'
import { airtableGetAll } from './_airtable.js'

const DA_TABLE  = 'tblaNln93bTaldquV'
const DA_PILOT  = 'fld5VShFudYtTQ9pm'
const DA_DATE   = 'fldP9zDqFfLSt1qqw'
const DA_ROUTE  = 'fldeg8UtYSPRn4IaN'
const DA_STATUS = 'fldgp2sUUDa9SoMbz'

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
    const filter = `AND({${DA_DATE}}='${today()}', FIND('${pilot.pilotRecordId}', ARRAYJOIN({${DA_PILOT}})))`
    const records = await airtableGetAll(DA_TABLE, filter, [DA_PILOT, DA_DATE, DA_ROUTE, DA_STATUS])

    if (!records.length) return res.json({ exists: false, route: [] })

    const rec = records[0]
    let route = []
    try {
      const raw = rec.fields[DA_ROUTE]
      if (raw) route = JSON.parse(raw)
    } catch {
      route = []
    }

    return res.json({
      exists: true,
      route,
      status: rec.fields[DA_STATUS] || 'Assigned',
    })
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    console.error('daily-route error:', err)
    return res.status(500).json({ error: err.message || 'Internal server error' })
  }
}

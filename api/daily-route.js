import jwt from 'jsonwebtoken'
import { airtableGetAll, airtablePatch, airtablePost, centralDateStr } from './_airtable.js'

const DA_TABLE  = 'tblaNln93bTaldquV'
const DA_PILOT  = 'fld5VShFudYtTQ9pm'
const DA_DATE   = 'fldP9zDqFfLSt1qqw'
const DA_ROUTE  = 'fldeg8UtYSPRn4IaN'
const DA_STATUS = 'fldgp2sUUDa9SoMbz'

function verifyToken(req) {
  const auth = req.headers.authorization || ''
  return jwt.verify(auth.replace('Bearer ', ''), process.env.JWT_SECRET)
}

// See _airtable.js centralDateStr — must use Central time, not server UTC.
function today() {
  return centralDateStr()
}

async function findTodayRecord(pilotRecordId) {
  const filter = `AND({${DA_DATE}}='${today()}', FIND('${pilotRecordId}', ARRAYJOIN({${DA_PILOT}})))`
  const records = await airtableGetAll(DA_TABLE, filter, [DA_PILOT, DA_DATE, DA_ROUTE, DA_STATUS])
  return records[0] || null
}

async function handleGet(req, res, pilot) {
  const rec = await findTodayRecord(pilot.pilotRecordId)
  if (!rec) return res.json({ exists: false, route: [] })

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
}

// Pilot-generated route (built client-side in src/utils/routePlanner.js) —
// upserts into the same Daily Assignments record/fields the pilot-daily-
// schedule skill writes to, so Admin/office still sees the plan for the day.
async function handlePost(req, res, pilot) {
  const { route } = req.body || {}
  if (!Array.isArray(route)) {
    return res.status(400).json({ error: 'route array is required' })
  }

  const existing = await findTodayRecord(pilot.pilotRecordId)
  const routeJson = JSON.stringify(route)

  if (existing) {
    await airtablePatch(DA_TABLE, existing.id, { [DA_ROUTE]: routeJson })
  } else {
    await airtablePost(DA_TABLE, {
      [DA_DATE]: today(),
      [DA_PILOT]: [pilot.pilotRecordId],
      [DA_ROUTE]: routeJson,
      [DA_STATUS]: 'Assigned',
    })
  }

  return res.json({ success: true })
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const pilot = verifyToken(req)
    if (req.method === 'GET') return await handleGet(req, res, pilot)
    return await handlePost(req, res, pilot)
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    console.error('daily-route error:', err)
    return res.status(500).json({ error: err.message || 'Internal server error' })
  }
}

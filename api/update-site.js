import jwt from 'jsonwebtoken'
import { airtablePatch, airtablePost, airtableGet, TABLES, FIELDS } from './_airtable.js'

function verifyToken(req) {
  const auth = req.headers.authorization || ''
  const token = auth.replace('Bearer ', '')
  return jwt.verify(token, process.env.JWT_SECRET)
}

// action: 'collected' | 'partial' | 'mob' | 'uncollect'
async function findOrCreateEOD(pilotRecordId, dateStr) {
  // dateStr = 'YYYY-MM-DD'
  const formula = `AND({${FIELDS.EOD_DATE}}="${dateStr}", FIND("${pilotRecordId}", ARRAYJOIN(${FIELDS.EOD_PILOT})))`
  const data = await airtableGet(TABLES.EOD_REPORTS, {
    filterByFormula: formula,
    fields: [FIELDS.EOD_DATE, FIELDS.EOD_PILOT, FIELDS.EOD_FULL_COLLECTION, FIELDS.EOD_PARTIAL_COLLECTION, FIELDS.EOD_MOBILIZATION],
    pageSize: 1,
  })

  if (data.records?.length > 0) {
    return data.records[0]
  }

  // Create a new EOD for today
  const newEod = await airtablePost(TABLES.EOD_REPORTS, {
    [FIELDS.EOD_DATE]: dateStr,
    [FIELDS.EOD_PILOT]: [pilotRecordId],
  })
  return newEod
}

async function linkSiteToEOD(eodRecord, siteRecordId, action) {
  const eodId = eodRecord.id
  const fields = eodRecord.fields || {}

  let fullList = (fields[FIELDS.EOD_FULL_COLLECTION] || []).map(r => r.id || r)
  let partialList = (fields[FIELDS.EOD_PARTIAL_COLLECTION] || []).map(r => r.id || r)
  let mobList = (fields[FIELDS.EOD_MOBILIZATION] || []).map(r => r.id || r)

  // Remove from all lists first
  fullList = fullList.filter(id => id !== siteRecordId)
  partialList = partialList.filter(id => id !== siteRecordId)
  mobList = mobList.filter(id => id !== siteRecordId)

  if (action === 'collected') fullList.push(siteRecordId)
  if (action === 'partial') partialList.push(siteRecordId)
  if (action === 'mob') mobList.push(siteRecordId)

  await airtablePatch(TABLES.EOD_REPORTS, eodId, {
    [FIELDS.EOD_FULL_COLLECTION]: fullList,
    [FIELDS.EOD_PARTIAL_COLLECTION]: partialList,
    [FIELDS.EOD_MOBILIZATION]: mobList,
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  try {
    const pilot = verifyToken(req)
    const { recordId, action } = req.body || {}

    if (!recordId || !action) {
      return res.status(400).json({ error: 'recordId and action required' })
    }

    const validActions = ['collected', 'partial', 'mob', 'uncollect']
    if (!validActions.includes(action)) {
      return res.status(400).json({ error: 'Invalid action' })
    }

    // Build the field updates for COLLECTION ASSETS
    const siteUpdate = {
      [FIELDS.COLLECTED_APP]: action === 'collected',
      [FIELDS.PARTIAL_COLLECTION]: action === 'partial',
      [FIELDS.MOB_FEE]: action === 'mob',
    }

    // Patch the site record
    const updated = await airtablePatch(TABLES.COLLECTION_ASSETS, recordId, siteUpdate)

    // Update the EOD report (skip for 'uncollect')
    if (action !== 'uncollect') {
      const today = new Date().toISOString().split('T')[0]
      const eodRecord = await findOrCreateEOD(pilot.pilotRecordId, today)
      await linkSiteToEOD(eodRecord, recordId, action)
    }

    res.json({ success: true, recordId, action })
  } catch (err) {
    console.error('Update site error:', err)
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    res.status(500).json({ error: err.message || 'Server error' })
  }
}

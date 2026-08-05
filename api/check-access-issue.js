import jwt from 'jsonwebtoken'
import { airtableGetAll } from './_airtable.js'

const ACCESS_ISSUES_TABLE = 'tblcL5VbpJLTll09r'
const SITE_LINK_FIELD = 'fldv0c8gBOVvorTZH' // linked record to Collection Assets

function verifyToken(req) {
  const auth = req.headers.authorization || ''
  return jwt.verify(auth.replace('Bearer ', ''), process.env.JWT_SECRET)
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    verifyToken(req)
  } catch {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { siteRecordId, since } = req.query
  if (!siteRecordId) return res.status(400).json({ error: 'siteRecordId required' })

  // `since` is the moment the pilot tapped the status button (ISO timestamp,
  // sent by the client — see src/utils/api.js checkAccessIssue). Requiring
  // the form to have been created after that point, rather than just "in the
  // last 24 hours," is what makes this a check for a genuinely NEW submission
  // — otherwise a site already sitting at Partial/MOB (which necessarily has
  // an access-issue record on file from when it was originally marked) would
  // immediately pass the check for a same-day recollect without the pilot
  // submitting anything new. Falls back to the old 24-hour window only if a
  // caller doesn't send `since` (defensive — current client always sends it).
  const sinceValid = typeof since === 'string' && !isNaN(Date.parse(since))
  const filter = sinceValid
    ? `IS_AFTER(CREATED_TIME(), DATETIME_PARSE("${since}"))`
    : `IS_AFTER(CREATED_TIME(), DATEADD(NOW(), -24, 'hours'))`

  try {
    const records = await airtableGetAll(ACCESS_ISSUES_TABLE, filter, [SITE_LINK_FIELD])

    const exists = records.some(r => {
      const links = r.fields[SITE_LINK_FIELD]
      if (!Array.isArray(links)) return false
      return links.some(link => {
        // Airtable REST API returns linked records as strings ("recXXX") or objects ({id:"recXXX"})
        if (typeof link === 'string') return link === siteRecordId
        return link?.id === siteRecordId
      })
    })

    return res.json({ exists })
  } catch (err) {
    console.error('check-access-issue error:', err)
    return res.status(500).json({ error: err.message || 'Failed to check access issue' })
  }
}

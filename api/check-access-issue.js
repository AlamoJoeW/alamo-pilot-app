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

  const { siteRecordId } = req.query
  if (!siteRecordId) return res.status(400).json({ error: 'siteRecordId required' })

  try {
    // Get records created in the last 24 hours
    const filter = `IS_AFTER(CREATED_TIME(), DATEADD(NOW(), -24, 'hours'))`
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

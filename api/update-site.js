import jwt from 'jsonwebtoken'
import { airtablePatch, TABLES, FIELDS } from './_airtable.js'

function verifyToken(req) {
  const auth = req.headers.authorization || ''
  return jwt.verify(auth.replace('Bearer ', ''), process.env.JWT_SECRET)
}

/**
 * POST /api/update-site
 * Body: { recordId: string, action: 'collected' | 'partial' | 'mob' | 'uncollect' }
 *
 * Updates ONLY the three collection status checkboxes on a COLLECTION_ASSETS record.
 * Does NOT create or modify any EOD_REPORTS records.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    verifyToken(req)
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { recordId, action } = req.body || {}

  if (!recordId || typeof recordId !== 'string') {
    return res.status(400).json({ error: 'recordId is required' })
  }

  const validActions = ['collected', 'partial', 'mob', 'uncollect']
  if (!validActions.includes(action)) {
    return res.status(400).json({ error: `action must be one of: ${validActions.join(', ')}` })
  }

  // Build the checkbox update — only one can be true at a time
  let fields = {}
  if (action === 'collected') {
    fields = {
      [FIELDS.COLLECTED_APP]:      true,
      [FIELDS.PARTIAL_COLLECTION]: false,
      [FIELDS.MOB_FEE]:            false,
    }
  } else if (action === 'partial') {
    fields = {
      [FIELDS.COLLECTED_APP]:      false,
      [FIELDS.PARTIAL_COLLECTION]: true,
      [FIELDS.MOB_FEE]:            false,
    }
  } else if (action === 'mob') {
    fields = {
      [FIELDS.COLLECTED_APP]:      false,
      [FIELDS.PARTIAL_COLLECTION]: false,
      [FIELDS.MOB_FEE]:            true,
    }
  } else if (action === 'uncollect') {
    fields = {
      [FIELDS.COLLECTED_APP]:      false,
      [FIELDS.PARTIAL_COLLECTION]: false,
      [FIELDS.MOB_FEE]:            false,
    }
  }

  // Stamp the app-status timestamp on every action. The pin color logic
  // (src/utils/mapColors.js -> colorForSite) shows this pilot-set status as the
  // pin's color for 24 hours, overriding the office-maintained Map Color field,
  // then falls back to Map Color automatically once the window passes.
  fields[FIELDS.APP_STATUS_SET_AT] = new Date().toISOString()

  try {
    await airtablePatch(TABLES.COLLECTION_ASSETS, recordId, fields)
    return res.json({ success: true })
  } catch (err) {
    console.error('update-site error:', err)
    return res.status(500).json({ error: err.message || 'Failed to update site' })
  }
}

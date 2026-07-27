import jwt from 'jsonwebtoken'
import { airtablePatch, TABLES, FIELDS } from './_airtable.js'

function verifyToken(req) {
  const auth = req.headers.authorization || ''
  return jwt.verify(auth.replace('Bearer ', ''), process.env.JWT_SECRET)
}

const VALID_ACTIONS = ['collected', 'partial', 'mob', 'uncollect']

// Build the checkbox update for a status action — only one can be true at a time.
// Every action also stamps APP_STATUS_SET_AT: the pin color logic
// (src/utils/mapColors.js -> colorForSite) shows this pilot-set status as the pin's
// color for 24 hours, overriding the office-maintained Map Color field, then falls
// back to Map Color automatically once the window passes.
function fieldsForAction(action) {
  const fields = {
    [FIELDS.COLLECTED_APP]:      action === 'collected',
    [FIELDS.PARTIAL_COLLECTION]: action === 'partial',
    [FIELDS.MOB_FEE]:            action === 'mob',
  }
  fields[FIELDS.APP_STATUS_SET_AT] = new Date().toISOString()
  return fields
}

const isValidId = id => typeof id === 'string' && id.startsWith('rec') && id.length === 17

/**
 * POST /api/update-site
 *
 * Three request shapes:
 *  1. { recordId, action }               — single-site status change (unchanged behavior)
 *  2. { recordIds: [...], action }       — bulk status change (List view bulk-select).
 *     Applies the same action to every record, continuing past individual failures.
 *     Returns { success: true, results: [{ recordId, ok, error? }, ...] }.
 *  3. { recordId, notes }                — freeform Notes text write. Does NOT touch
 *     the status checkboxes or the APP_STATUS_SET_AT pin-color timestamp.
 *
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

  const { recordId, recordIds, action, notes } = req.body || {}

  // Shape 3 — Notes edit
  if (notes !== undefined) {
    if (!recordId || !isValidId(recordId)) {
      return res.status(400).json({ error: 'recordId is required' })
    }
    if (typeof notes !== 'string') {
      return res.status(400).json({ error: 'notes must be a string' })
    }
    try {
      await airtablePatch(TABLES.COLLECTION_ASSETS, recordId, { [FIELDS.NOTES]: notes })
      return res.json({ success: true })
    } catch (err) {
      console.error('update-site notes error:', err)
      return res.status(500).json({ error: err.message || 'Failed to save notes' })
    }
  }

  if (!VALID_ACTIONS.includes(action)) {
    return res.status(400).json({ error: `action must be one of: ${VALID_ACTIONS.join(', ')}` })
  }

  // Shape 2 — bulk status change
  if (Array.isArray(recordIds)) {
    const invalid = recordIds.filter(id => !isValidId(id))
    if (invalid.length > 0) {
      return res.status(400).json({ error: `Invalid site record ID(s): ${invalid.join(', ')}` })
    }
    const fields = fieldsForAction(action)
    const results = []
    for (const id of recordIds) {
      try {
        await airtablePatch(TABLES.COLLECTION_ASSETS, id, fields)
        results.push({ recordId: id, ok: true })
      } catch (err) {
        console.error('update-site bulk error:', id, err)
        results.push({ recordId: id, ok: false, error: err.message || 'Failed' })
      }
    }
    return res.json({ success: true, results })
  }

  // Shape 1 — single-site status change
  if (!recordId || !isValidId(recordId)) {
    return res.status(400).json({ error: 'recordId is required' })
  }

  try {
    await airtablePatch(TABLES.COLLECTION_ASSETS, recordId, fieldsForAction(action))
    return res.json({ success: true })
  } catch (err) {
    console.error('update-site error:', err)
    return res.status(500).json({ error: err.message || 'Failed to update site' })
  }
}

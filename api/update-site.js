import jwt from 'jsonwebtoken'
import { signNote } from './_notes.js'
import { airtablePatch, TABLES, FIELDS, BASE_ID, API_KEY, slimAttachments, PIN_ICON_APP_TO_AIRTABLE } from './_airtable.js'
import { pilotFirstName } from './_notes.js'

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

// Vercel caps request bodies at ~4.5 MB; the app compresses screenshots well
// below that before sending (see src/utils/imageCompress.js).
export const config = { api: { bodyParser: { sizeLimit: '4mb' } } }

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BASE64_CHARS = 3_600_000 // ~2.7 MB of image data

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
 *  4. { recordId, pinIcon }              — pin icon shape write (Building/Tower/SBA/
 *     COA/LAANC as the app's lowercase type strings, or null to clear). Synced to the
 *     shared "App Pin Icon" field — visible in both the pilot map and Admin view.
 *
 * Does NOT create or modify any EOD_REPORTS records.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  let pilot
  try {
    pilot = verifyToken(req)
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { recordId, recordIds, action, notes, pinIcon, attachment, removeAttachmentId } = req.body || {}

  // Shape 5 — add an image to the site's note attachments (Airtable's direct
  // upload endpoint; appends to the field). Returns the full updated list.
  if (attachment !== undefined) {
    if (!recordId || !isValidId(recordId)) {
      return res.status(400).json({ error: 'recordId is required' })
    }
    const { contentType, data } = attachment || {}
    if (!ALLOWED_IMAGE_TYPES.includes(contentType) || typeof data !== 'string' || !data) {
      return res.status(400).json({ error: 'Attachment must be a JPEG, PNG or WebP image' })
    }
    if (data.length > MAX_BASE64_CHARS) {
      return res.status(413).json({ error: 'Image is too large — try a smaller screenshot' })
    }
    const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg'
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')
    const who = (pilotFirstName(pilot) || 'pilot').replace(/[^A-Za-z0-9]/g, '')
    const filename = `${who}-${stamp}.${ext}`
    try {
      const up = await fetch(
        `https://content.airtable.com/v0/${BASE_ID}/${recordId}/${FIELDS.NOTE_ATTACHMENTS}/uploadAttachment`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ contentType, file: data, filename }),
        }
      )
      if (!up.ok) throw new Error(`Airtable upload error ${up.status}: ${await up.text()}`)
      const json = await up.json()
      const fields = json.fields || {}
      return res.json({ success: true, attachments: slimAttachments(fields[FIELDS.NOTE_ATTACHMENTS] || fields['App Note Attachments']) })
    } catch (err) {
      console.error('update-site attachment error:', err)
      return res.status(500).json({ error: err.message || 'Failed to upload image' })
    }
  }

  // Shape 6 — remove one image from the site's note attachments.
  if (removeAttachmentId !== undefined) {
    if (!recordId || !isValidId(recordId)) {
      return res.status(400).json({ error: 'recordId is required' })
    }
    try {
      const cur = await fetch(
        `https://api.airtable.com/v0/${BASE_ID}/${TABLES.COLLECTION_ASSETS}/${recordId}?returnFieldsByFieldId=true`,
        { headers: { Authorization: `Bearer ${API_KEY}` } }
      )
      if (!cur.ok) throw new Error(`Airtable GET error ${cur.status}`)
      const existing = (await cur.json()).fields?.[FIELDS.NOTE_ATTACHMENTS] || []
      const keep = existing.filter(a => a.id !== removeAttachmentId).map(a => ({ id: a.id }))
      const out = await airtablePatch(TABLES.COLLECTION_ASSETS, recordId, { [FIELDS.NOTE_ATTACHMENTS]: keep })
      return res.json({ success: true, attachments: slimAttachments(out.fields?.[FIELDS.NOTE_ATTACHMENTS] || out.fields?.['App Note Attachments']) })
    } catch (err) {
      console.error('update-site remove attachment error:', err)
      return res.status(500).json({ error: err.message || 'Failed to remove image' })
    }
  }

  // Shape 3 — Notes edit
  if (notes !== undefined) {
    if (!recordId || !isValidId(recordId)) {
      return res.status(400).json({ error: 'recordId is required' })
    }
    if (typeof notes !== 'string') {
      return res.status(400).json({ error: 'notes must be a string' })
    }
    try {
      await airtablePatch(TABLES.COLLECTION_ASSETS, recordId, { [FIELDS.NOTES]: signNote(notes, pilot) })
      return res.json({ success: true, notes: signNote(notes, pilot) })
    } catch (err) {
      console.error('update-site notes error:', err)
      return res.status(500).json({ error: err.message || 'Failed to save notes' })
    }
  }

  // Shape 4 — Pin icon edit
  if (pinIcon !== undefined) {
    if (!recordId || !isValidId(recordId)) {
      return res.status(400).json({ error: 'recordId is required' })
    }
    if (pinIcon !== null && !PIN_ICON_APP_TO_AIRTABLE[pinIcon]) {
      return res.status(400).json({ error: `pinIcon must be one of: ${Object.keys(PIN_ICON_APP_TO_AIRTABLE).join(', ')}, or null` })
    }
    try {
      await airtablePatch(TABLES.COLLECTION_ASSETS, recordId, {
        [FIELDS.PIN_ICON]: pinIcon === null ? null : PIN_ICON_APP_TO_AIRTABLE[pinIcon],
      }, true)
      return res.json({ success: true })
    } catch (err) {
      console.error('update-site pinIcon error:', err)
      return res.status(500).json({ error: err.message || 'Failed to save pin icon' })
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

import jwt from 'jsonwebtoken'
import { airtablePost, BASE_ID, API_KEY } from './_airtable.js'

const ACCESS_ISSUES_TABLE = 'tblcL5VbpJLTll09r'

const AI_FIELDS = {
  DATE: 'fldDENl5LJkbbu2tS',
  ASSET_ID: 'fldv0c8gBOVvorTZH',
  NAME: 'fldchDQQ8NEMPOzxS',
  ATTACHMENTS: 'fldekRTd1lvIfnwJF',
  MOBILIZATION_FEE: 'fldqsqKlvsAShtf8h',
  PARTIAL_COLLECTION: 'fldb70YGgOwLjJcpd',
  NOTES: 'fldNhmvNbLAGUkfMP',
}

export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } },
}

function verifyToken(req) {
  const auth = req.headers.authorization || ''
  const token = auth.replace('Bearer ', '')
  if (!token) throw new Error('No token')
  return jwt.verify(token, process.env.JWT_SECRET)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  try {
    const pilot = verifyToken(req)
    const { recordId, action, notes, fileBase64, fileName, fileMimeType } = req.body || {}

    if (!recordId || !action || !notes?.trim()) {
      return res.status(400).json({ error: 'recordId, action, and notes are required' })
    }

    const fields = {
      [AI_FIELDS.DATE]: new Date().toISOString().split('T')[0],
      [AI_FIELDS.ASSET_ID]: [recordId],
      [AI_FIELDS.NOTES]: notes.trim(),
    }

    if (pilot.pilotRecordId) {
      fields[AI_FIELDS.NAME] = [pilot.pilotRecordId]
    }

    if (action === 'partial') {
      fields[AI_FIELDS.PARTIAL_COLLECTION] = true
    } else if (action === 'mob') {
      fields[AI_FIELDS.MOBILIZATION_FEE] = true
    }

    const newRecord = await airtablePost(ACCESS_ISSUES_TABLE, fields)

    if (fileBase64 && fileName) {
      try {
        const buffer = Buffer.from(fileBase64, 'base64')
        const mimeType = fileMimeType || 'application/octet-stream'
        const uploadUrl = `https://content.airtable.com/v0/${BASE_ID}/${newRecord.id}/${AI_FIELDS.ATTACHMENTS}/uploadAttachment`

        const uploadRes = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${API_KEY}`,
            'Content-Type': mimeType,
            'Content-Disposition': `attachment; filename="${fileName.replace(/"/g, '_')}"`,
            'x-airtable-application-id': BASE_ID,
          },
          body: buffer,
        })

        if (!uploadRes.ok) {
          console.error('Attachment upload failed:', await uploadRes.text())
        }
      } catch (attachErr) {
        console.error('Attachment error:', attachErr)
      }
    }

    res.json({ success: true, id: newRecord.id })
  } catch (err) {
    console.error('Access issue error:', err)
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    res.status(500).json({ error: err.message || 'Server error' })
  }
}

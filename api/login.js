import jwt from 'jsonwebtoken'
import { airtableGet, TABLES, FIELDS } from './_airtable.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { email, password } = req.body || {}
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' })
  }

  try {
    // Find pilot by email
    const formula = `LOWER({${FIELDS.PILOT_EMAIL}})="${email.trim().toLowerCase()}"`
    const data = await airtableGet(TABLES.PILOTS, {
      filterByFormula: formula,
      fields: [
        FIELDS.PILOT_EMAIL,
        FIELDS.PILOT_PASSWORD,
        FIELDS.PILOT_FIRST_NAME,
        FIELDS.PILOT_DISPLAY_NAME,
      ],
      pageSize: 1,
    })

    const pilot = data.records?.[0]
    if (!pilot) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    const stored = pilot.fields[FIELDS.PILOT_PASSWORD]
    if (!stored || stored.trim() !== password.trim()) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    // First Name may be multilineText with newline, trim it
    const firstName = (pilot.fields[FIELDS.PILOT_FIRST_NAME] || '').trim().split('\n')[0].trim()
    const displayName = (pilot.fields[FIELDS.PILOT_DISPLAY_NAME] || firstName).trim()

    const token = jwt.sign(
      {
        pilotRecordId: pilot.id,
        email: email.trim().toLowerCase(),
        firstName,
        displayName,
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    )

    res.json({ token, firstName, displayName })
  } catch (err) {
    console.error('Login error:', err)
    res.status(500).json({ error: 'Server error' })
  }
}

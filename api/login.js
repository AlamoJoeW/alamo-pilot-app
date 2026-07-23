import jwt from 'jsonwebtoken'
import { airtableGet, TABLES, FIELDS } from './_airtable.js'

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end()
    const { email, password } = req.body || {}
        if (!email || !password) return res.status(400).json({ error: 'Email and password required' })
    const cleanEmail = email.trim().toLowerCase()
    const cleanPassword = password.trim()
    try {
          const formula = `LOWER({${FIELDS.PILOT_EMAIL}})="${cleanEmail}"`
          console.log('Login attempt for:', cleanEmail)
          console.log('Formula:', formula)
          const data = await airtableGet(TABLES.PILOTS, {
                  filterByFormula: formula,
                  fields: [FIELDS.PILOT_EMAIL, FIELDS.PILOT_PASSWORD, FIELDS.PILOT_FIRST_NAME, FIELDS.PILOT_DISPLAY_NAME, FIELDS.PILOT_ADMIN],
                  pageSize: 1,
          })
          console.log('Records found:', data.records?.length)
          const pilot = data.records?.[0]
          console.log('Pilot record ID:', pilot?.id)
          console.log('Field keys returned:', pilot ? Object.keys(pilot.fields).join(',') : 'none')
          if (!pilot) {
                  console.log('No pilot record found for:', cleanEmail)
                  return res.status(401).json({ error: 'Invalid email or password' })
          }
          const stored = pilot.fields[FIELDS.PILOT_PASSWORD]
          console.log('PW field ID:', FIELDS.PILOT_PASSWORD)
          console.log('Stored value:', JSON.stringify(stored))
          console.log('Input value:', JSON.stringify(cleanPassword))
          console.log('Match:', stored?.trim() === cleanPassword)
          if (!stored || stored.trim() !== cleanPassword) return res.status(401).json({ error: 'Invalid email or password' })
          const firstName = (pilot.fields[FIELDS.PILOT_FIRST_NAME] || '').trim().split('\n')[0].trim()
          const displayName = (pilot.fields[FIELDS.PILOT_DISPLAY_NAME] || firstName).trim()
          const isAdmin = !!pilot.fields[FIELDS.PILOT_ADMIN]
          const token = jwt.sign({ pilotRecordId: pilot.id, email: cleanEmail, firstName, displayName, isAdmin }, process.env.JWT_SECRET, { expiresIn: '30d' })
          res.json({ token, firstName, displayName, isAdmin })
    } catch (err) {
          console.error('Login error:', err)
          res.status(500).json({ error: 'Server error' })
    }
}

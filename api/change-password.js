import jwt from 'jsonwebtoken'
  import { airtableGet, airtablePatch, TABLES, FIELDS } from './_airtable.js'

  export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

      const authHeader = req.headers.authorization || ''
      const token = authHeader.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Not authenticated' })

  let payload
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET)
} catch {
    return res.status(401).json({ error: 'Invalid token' })
}

  const { currentPassword, newPassword } = req.body || {}
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Both passwords required' })
}
  if (newPassword.trim().length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' })
}

  try {
    const data = await airtableGet(TABLES.PILOTS, {
      filterByFormula: `RECORD_ID()="${payload.pilotRecordId}"`,
      fields: [FIELDS.PILOT_PASSWORD],
      pageSize: 1,
})

    const pilot = data.records?.[0]
    if (!pilot) return res.status(404).json({ error: 'Pilot not found' })

    const stored = pilot.fields[FIELDS.PILOT_PASSWORD]
    if (!stored || stored.trim() !== currentPassword.trim()) {
      return res.status(401).json({ error: 'Current password is incorrect' })
}

    await airtablePatch(TABLES.PILOTS, pilot.id, {
      [FIELDS.PILOT_PASSWORD]: newPassword.trim(),
      [FIELDS.PASSWORD_CHANGED]: true,
})

    // Reissue the token with mustChangePassword cleared so the app doesn't
    // force the pilot back into this screen on their next page load this
    // session. Carries forward the rest of the original claims unchanged.
    // (Strip iat/exp from the old payload — jwt.sign rejects an explicit exp
    // when expiresIn is also passed.)
    const { iat, exp, ...claims } = payload
    const newToken = jwt.sign(
      { ...claims, mustChangePassword: false },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    )

    res.json({ ok: true, token: newToken })
} catch (err) {
    console.error('Change password error:', err)
    res.status(500).json({ error: 'Server error' })
}
}

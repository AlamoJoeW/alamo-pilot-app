import { airtableGetAll } from './_airtable.js'

const AIRCRAFT_TABLE = 'tblbbnIwzQJRa4mpo'
const AIRCRAFT_NAME  = 'flds8icEjiTRwwWno'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const records = await airtableGetAll(AIRCRAFT_TABLE, null, [AIRCRAFT_NAME])
    const aircraft = records
      .map(r => ({ id: r.id, name: r.fields[AIRCRAFT_NAME] || '' }))
      .filter(a => a.name)
      .sort((a, b) => a.name.localeCompare(b.name))
    return res.json({ aircraft })
  } catch (err) {
    console.error('aircraft error:', err)
    return res.status(500).json({ error: err.message || 'Internal server error' })
  }
}

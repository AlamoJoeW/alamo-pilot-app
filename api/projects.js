import { airtableGetAll } from './_airtable.js'

const PROJECTS_TABLE   = 'tblHYYTZxN8IHRNwA'
const PROJECT_NAME     = 'fldxRxPZss5l3BFFx'
const PROJECT_ACTIVE   = 'fldbGd0Ph45S89qoa'

function deriveType(name) {
  if (name.startsWith('vHive Verizon'))  return 'verizon'
  if (/Solar|Wind/.test(name))           return 'solar_wind'
  if (/Methane|BP/.test(name))           return 'methane'
  return 'other'
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const filter = `{${PROJECT_ACTIVE}}='Yes'`
    const records = await airtableGetAll(PROJECTS_TABLE, filter, [PROJECT_NAME, PROJECT_ACTIVE])
    const projects = records
      .map(r => {
        const name = r.fields[PROJECT_NAME] || ''
        return { id: r.id, name, type: deriveType(name) }
      })
      .filter(p => p.name)
      .sort((a, b) => a.name.localeCompare(b.name))
    return res.json({ projects })
  } catch (err) {
    console.error('projects error:', err)
    return res.status(500).json({ error: err.message || 'Internal server error' })
  }
}

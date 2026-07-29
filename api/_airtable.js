// Shared Airtable helpers for all API routes

export const BASE_ID = process.env.AIRTABLE_BASE || 'app3uLCFgt3Y0aPaa'
export const API_KEY = process.env.AIRTABLE_API_KEY

// Alamo Airborne pilots fly on Central time, but Vercel serverless functions
// run in UTC. UTC's calendar day rolls over at 7pm CDT / 6pm CST — squarely in
// the middle of a normal flying day. Every "today" comparison used to gate
// pilot actions (today's preflight, today's EOD, today's route) MUST use this
// helper instead of new Date().toISOString(), or a pilot still out past that
// hour gets a spurious "no preflight on file" once the server's UTC date rolls
// to tomorrow while their submitted-this-morning preflight is still dated
// today. Confirmed as the cause of two pilots (Lex, Sharee) getting locked out
// of marking sites/submitting EOD on 2026-07-28 despite having preflighted.
export function centralDateStr(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export const TABLES = {
  PILOTS: 'tblYVHjbcI46iQ4EB',
  COLLECTION_ASSETS: 'tbl1y4oOzEAhf0a4S',
  EOD_REPORTS: 'tblxlNUqgFy251qha',
}

export const FIELDS = {
  // Pilots
  PILOT_EMAIL:        'fldtJh69QILzlTgMY',
  PILOT_PASSWORD:     'fld8mIJRKQnPqAz2p',
  PILOT_FIRST_NAME:   'fldj99i8QHMNP1N9a',
  PILOT_DISPLAY_NAME: 'fldKEKxHbI9lRCXTR', // formula: full name
  PILOT_ADMIN:        'flda57OfNG0SKs3Dy', // checkbox: can see Admin view
  PASSWORD_CHANGED:   'fldFx1JayRBFbseaf', // checkbox: false = force a password change on next login

  // Collection Assets
  SITE_ID:              'fldeMYc6CwJOqKKNh',
  FUZE_ID:              'fld6vEZSPDY7KW38S',
  COLLECTION_STATUS:    'fld1EPWNQo3zBPsK7',
  SITE_ISSUE:           'fldovKW04qQhgVnu7',
  PILOT_ASSIGNED:       'fldxdjMwaTmXabapY',
  PILOT_APP:            'fld6U7B31MX3x8NzQ', // linked record to Pilots table
  SUB_PROJECT:          'fldbhgVAo5Zw5kTAD',
  ADDRESS:              'fldcDkKV2vyn25UC5',
  CITY:                 'fldlxY0GC60x2Sdhc',
  STATE:                'fldSmMUwJ3XV9P4wt',
  ZIP:                  'fldwQOL2kGzhS7KNm',
  SITE_STRUCTURE_TYPE:  'fldEarowciBZ1xo2B',
  STRUCTURE_HEIGHT:     'fldIDfYAc79cbgdf5',
  AIRPORT:              'fldsh2jGThrn8lPn3',
  AIRSPACE:             'fldeE5RD1XLMIOoXo',
  LATITUDE:             'fldfrOZfgkRgF3fVY',
  LONGITUDE:            'fldBRvkT3ZwBIJS05',
  DATE_ADDED:           'fldvZjxOCRfcT055V',
  MAP_COLOR:            'fldd8KeiQAeFXc2cR',
  SITE_STRUCTURE_OWNER: 'fldOTBMryx9tr8hSf',
  MOB_FEE:              'fldZDb14q18VOR2De',
  PARTIAL_COLLECTION:   'fldcD4EwDU5HkDFua',
  COLLECTED_APP:        'fldNK7WyoeYeDhgE6',
  COA:                  'fld2N9NqZJLUBUp9U',
  APP_STATUS_SET_AT:    'fldBIOnu0qAMwzrCk', // dateTime, stamped by update-site.js — drives the 24h pin color override
  NOTES:                'fld1nnUo9UIBHxLct', // single-line text — pilot-editable freeform notes (field description mentions an unrelated date calc; per Joe, that's stale/meaningless — field is used as plain notes)
  REFLY_NOTES:          'fldfUVeri43DvQACa', // AI-generated text — why this site needs a reflight
  REFLY:                'fldozaucwq5gpZsun', // checkbox
  REFLY_COMPLETED:      'fldhJKccNPreDZQsh', // checkbox
  PIN_ICON:             'fldYV0oHpkm43kwLd', // single select: Building/Tower/SBA/COA/LAANC — set from SiteDetail's icon picker, shown on both pilot map and Admin

  // EOD Reports
  EOD_DATE:             'fldHhWbzHpjzQIQ3n',
  EOD_PILOT:            'fldnARlXlU1Y1lov4',
  EOD_FULL_COLLECTION:  'fldNvJt3DszkVZHyC',
  EOD_PARTIAL_COLLECTION: 'fldx1NbBv3bFvBoJf',
  EOD_MOBILIZATION:     'fldEv1OCPrpOhjMqs',
  EOD_FULL_COUNT:       'fldpCI0Ma5rrmX9MC',
  EOD_PARTIAL_COUNT:    'fld2CPBKoJiPbjKPn',
  EOD_ZERO_COLLECTIONS_NOTES: 'fldbkj4rREqRh6m3V', // "Notes for zero collections" — required when Full + Partial counts are both 0
  EOD_PROJECT:          'fldvdVxx1eamdRkyM',
  EOD_PREFLIGHT:        'flddNoMMCCEfwxmvZ', // link to today's Preflight risk assessment record
  EOD_REFLIGHTS_YN:     'fldty8tlL12IOged6', // "WERE ANY REFLIGHT'S COMPLETED TODAY?" single select Yes/No
  EOD_REFLYS_COUNT:     'fldvlsjM1BherNFWq', // "RE-FLYS COLLECTED" number
  EOD_REFLYS_SITES:     'fldPNf8lBxy6unyh1', // linked Collection Assets records that were re-flown
  EOD_REFLYS_NOTES:     'fld9dVIu04p2d094c', // "Notes for any Re-flys that were done today."
  EOD_VISITED_UNCOLLECTED_YN: 'fldx5VsZz3LAOjq0N', // "Did you visit a site that you could not collect today?" (mobilization fee gate)
  EOD_MOB_NOTES:        'fldMndVtYGze162HX', // "Notes for mobilization fee sites"
  EOD_GENERAL_NOTES:    'fldkzk2QgquNVVUIC', // "General Notes"
  EOD_AIRDATA_SYNC:     'fld6TQrHMgoz8Uq4K', // "ARE YOUR FLIGHT LOGS FOR TODAY SYNCED IN AIRDATA?"
  EOD_END_LAT:          'fldsXSAqo2HCvDqzg',
  EOD_END_LNG:          'fldAl7s8VeN3UWQtE',
}

// All site fields to fetch for the app
export const SITE_FIELDS = Object.values(FIELDS).filter(id =>
  [
    'fldeMYc6CwJOqKKNh', 'fld6vEZSPDY7KW38S', 'fld1EPWNQo3zBPsK7',
    'fldovKW04qQhgVnu7', 'fldxdjMwaTmXabapY', 'fld6U7B31MX3x8NzQ', 'fldbhgVAo5Zw5kTAD',
    'fldcDkKV2vyn25UC5', 'fldlxY0GC60x2Sdhc', 'fldSmMUwJ3XV9P4wt',
    'fldwQOL2kGzhS7KNm', 'fldEarowciBZ1xo2B', 'fldIDfYAc79cbgdf5',
    'fldsh2jGThrn8lPn3', 'fldeE5RD1XLMIOoXo', 'fldfrOZfgkRgF3fVY',
    'fldBRvkT3ZwBIJS05', 'fldvZjxOCRfcT055V', 'fldd8KeiQAeFXc2cR',
    'fldOTBMryx9tr8hSf', 'fldZDb14q18VOR2De', 'fldcD4EwDU5HkDFua',
    'fldNK7WyoeYeDhgE6', 'fld2N9NqZJLUBUp9U', 'fldBIOnu0qAMwzrCk',
    'fld1nnUo9UIBHxLct', 'fldfUVeri43DvQACa', 'fldozaucwq5gpZsun', 'fldhJKccNPreDZQsh',
    'fldYV0oHpkm43kwLd',
  ].includes(id)
)

// Pin icon shape names as stored in Airtable (singleSelect choices) vs. the
// lowercase type strings used throughout the app's icon-drawing code
// (src/utils/mapIcons.js, SiteDetail.jsx's ICON_TYPES). Kept as an explicit
// map rather than a case transform since SBA/COA/LAANC are acronyms.
export const PIN_ICON_AIRTABLE_TO_APP = {
  Building: 'building', Tower: 'tower', SBA: 'sba', COA: 'coa', LAANC: 'laanc',
}
export const PIN_ICON_APP_TO_AIRTABLE = {
  building: 'Building', tower: 'Tower', sba: 'SBA', coa: 'COA', laanc: 'LAANC',
}

export async function airtableGet(table, params = {}) {
  const qs = new URLSearchParams()
  qs.set('returnFieldsByFieldId', 'true')
  if (params.filterByFormula) qs.set('filterByFormula', params.filterByFormula)
  if (params.fields) params.fields.forEach(f => qs.append('fields[]', f))
  if (params.offset) qs.set('offset', params.offset)
  if (params.maxRecords) qs.set('maxRecords', params.maxRecords)
  if (params.pageSize) qs.set('pageSize', params.pageSize)
  if (params.view) qs.set('view', params.view)

  const url = `https://api.airtable.com/v0/${BASE_ID}/${table}?${qs}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${API_KEY}` } })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Airtable GET error ${res.status}: ${err}`)
  }
  return res.json()
}

export async function airtablePatch(table, recordId, fields) {
  const url = `https://api.airtable.com/v0/${BASE_ID}/${table}/${recordId}`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Airtable PATCH error ${res.status}: ${err}`)
  }
  return res.json()
}

export async function airtablePost(table, fields) {
  const url = `https://api.airtable.com/v0/${BASE_ID}/${table}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Airtable POST error ${res.status}: ${err}`)
  }
  return res.json()
}

// Paginate through all records matching a filter
export async function airtableGetAll(table, filterByFormula, fields, view) {
  const records = []
  let offset = null
  do {
    const params = { filterByFormula, fields, pageSize: 100 }
    if (view) params.view = view
    if (offset) params.offset = offset
    const data = await airtableGet(table, params)
    records.push(...data.records)
    offset = data.offset || null
  } while (offset)
  return records
}

// Airtable views (on the COLLECTION_ASSETS table) that hold sites for every
// project the pilot app supports. The pilot map (api/sites.js) and Admin view
// (api/admin.js) both pull from every view listed here, deduped by record ID.
// To add support for a new non-Verizon project, add its view name here —
// no other code changes needed.
export const SITE_VIEWS = [
  'Verizon vHive All for KMLs',
  'UPNY',
]

// Fetches and merges Collection Assets records across every view in
// SITE_VIEWS (deduped by record ID — a site should only live in one view,
// but dedupe defensively in case a site ever ends up in more than one).
export async function fetchAllSiteRecords() {
  const byId = new Map()
  for (const view of SITE_VIEWS) {
    const records = await airtableGetAll(TABLES.COLLECTION_ASSETS, null, SITE_FIELDS, view)
    records.forEach(r => byId.set(r.id, r))
  }
  return [...byId.values()]
}

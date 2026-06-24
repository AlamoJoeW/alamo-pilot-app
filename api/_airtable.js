// Shared Airtable helpers for all API routes

export const BASE_ID = process.env.AIRTABLE_BASE || 'app3uLCFgt3Y0aPaa'
export const API_KEY = process.env.AIRTABLE_API_KEY

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

  // EOD Reports
  EOD_DATE:             'fldHhWbzHpjzQIQ3n',
  EOD_PILOT:            'fldnARlXlU1Y1lov4',
  EOD_FULL_COLLECTION:  'fldNvJt3DszkVZHyC',
  EOD_PARTIAL_COLLECTION: 'fldx1NbBv3bFvBoJf',
  EOD_MOBILIZATION:     'fldEv1OCPrpOhjMqs',
  EOD_FULL_COUNT:       'fldpCI0Ma5rrmX9MC',
  EOD_PARTIAL_COUNT:    'fld2CPBKoJiPbjKPn',
  EOD_PROJECT:          'fldvdVxx1eamdRkyM',
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
    'fldNK7WyoeYeDhgE6', 'fld2N9NqZJLUBUp9U',
  ].includes(id)
)

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

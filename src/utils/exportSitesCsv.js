import { statusBucketForSite } from './mapColors'

// Column order = what the pilot sees in the CSV. `get` pulls from the site
// object the app already has in memory (same data as the List/Map tabs), so
// this works offline too.
const COLUMNS = [
  ['Site ID',             s => s.siteId],
  ['FUZE ID',             s => s.fuzeId],
  ['Status',              s => statusBucketForSite(s)],
  ['Collection Status',   s => s.collectionStatus],
  ['Site Issue',          s => s.siteIssue],
  ['Sub Project',         s => s.subProject],
  ['Pre/Post',            s => s.prePost],
  ['Forecast Date',       s => s.forecastDate],
  ['Date Added',          s => s.dateAdded],
  ['Address',             s => s.address],
  ['City',                s => s.city],
  ['State',               s => s.state],
  ['ZIP',                 s => s.zip],
  ['Latitude',            s => s.lat],
  ['Longitude',           s => s.lng],
  ['Structure Type',      s => s.siteStructureType],
  ['Structure Height',    s => s.structureHeight],
  ['Structure Owner',     s => s.siteStructureOwner],
  ['Airport',             s => s.airport],
  ['Airspace',            s => s.airspace],
  ['COA Request Status',  s => s.coaRequestStatus],
  ['COA Confirmation',    s => s.coaRequestConfirmation],
  ['Mob Fee',             s => (s.mobFee ? 'Yes' : '')],
  ['Partial Collection',  s => (s.partialCollection ? 'Yes' : '')],
  ['Refly',               s => (s.refly ? 'Yes' : '')],
  ['Refly Completed',     s => (s.reflyCompleted ? 'Yes' : '')],
  ['Notes',               s => s.notes],
  ['Refly Notes',         s => s.reflyNotes],
]

function csvCell(value) {
  if (value === null || value === undefined) return ''
  const str = String(value)
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

export function exportSitesCsv(sites, pilotName) {
  const header = COLUMNS.map(([name]) => csvCell(name)).join(',')
  const rows = sites.map(site => COLUMNS.map(([, get]) => csvCell(get(site))).join(','))
  // BOM so Excel opens UTF-8 (accents, etc.) correctly.
  const csv = '﻿' + [header, ...rows].join('\r\n')

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
  const safeName = String(pilotName || 'Pilot').replace(/[^A-Za-z0-9_-]+/g, '_')
  const filename = `AlamoSites_${safeName}_${today}.csv`

  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Formats a plain YYYY-MM-DD date string (e.g. Airtable's Forecast Date
// formula field) as a locale date without the off-by-one-day shift you get
// from `new Date('2026-05-28').toLocaleDateString()` — that constructor
// parses the string as UTC midnight, which rolls back to the previous day
// once toLocaleDateString() renders it in a US timezone behind UTC.
export function formatDateOnly(dateStr) {
  if (!dateStr) return ''
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr)
  if (!match) return dateStr
  const [, y, m, d] = match
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString()
}

// Appends "- <pilot first name>" to the end of freeform notes so every note shows who wrote it.
// - Empty notes stay empty (so clearing a note still clears it).
// - If the note already ends with this pilot's signature (e.g. re-editing an old note), it isn't doubled.
export function pilotFirstName(pilot) {
  const raw = (pilot && (pilot.firstName || pilot.displayName)) || ''
  return String(raw).trim().split(/\s+/)[0] || ''
}

// Today's date as mm/dd/yyyy in Central time (same "today" the rest of the app uses).
export function signatureDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

// Signature is "- FirstName mm/dd/yyyy". A note that already ends with this pilot's
// signature is never doubled: a dated one is left alone (so the client-signed copy that
// reaches the server isn't re-signed), and an older date-less "- FirstName" is upgraded
// to the dated form.
export function signNote(text, pilot) {
  if (typeof text !== 'string') return text
  const trimmed = text.trim()
  if (!trimmed) return text
  const name = pilotFirstName(pilot)
  if (!name) return text
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (new RegExp(`-\\s*${esc}\\s+\\d{2}/\\d{2}/\\d{4}$`, 'i').test(trimmed)) return trimmed
  const base = trimmed.replace(new RegExp(`\\s*-\\s*${esc}$`, 'i'), '').trim()
  return `${base || trimmed} - ${name} ${signatureDate()}`
}

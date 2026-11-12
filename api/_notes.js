// Appends "- <pilot first name>" to the end of freeform notes so every note shows who wrote it.
// - Empty notes stay empty (so clearing a note still clears it).
// - If the note already ends with this pilot's signature (e.g. re-editing an old note), it isn't doubled.
export function pilotFirstName(pilot) {
  const raw = (pilot && (pilot.firstName || pilot.displayName)) || ''
  return String(raw).trim().split(/\s+/)[0] || ''
}

export function signNote(text, pilot) {
  if (typeof text !== 'string') return text
  const trimmed = text.trim()
  if (!trimmed) return text
  const name = pilotFirstName(pilot)
  if (!name) return text
  const sig = `- ${name}`
  if (trimmed.toLowerCase().endsWith(sig.toLowerCase())) return trimmed
  return `${trimmed} ${sig}`
}

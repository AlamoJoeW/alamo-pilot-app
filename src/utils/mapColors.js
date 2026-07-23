// Maps the Airtable "map color" single-select field (COLLECTION ASSETS) to a hex
// color for pins on the Map and Admin views. Airtable only exposes a symbolic color
// name (e.g. "purpleDark1") per choice, not a hex value, so these are hand-picked
// equivalents — tweak freely, they don't need to match Airtable's palette exactly.
//
// Choices pulled from Airtable on 2026-07-23. If Joe adds a new "map color" choice
// in Airtable, add it here too, or it'll fall back to STATUS_FALLBACK_COLOR / grey.

export const MAP_COLOR_HEX = {
  'Remaining':                                  '#ef4444', // red
  'Remaining Further Coordination Required':    '#f97316', // orange
  'Partial':                                    '#facc15', // yellow
  'Partial Further Coordination Required':      '#facc15', // yellow
  'Collected':                                  '#22c55e', // green
  'COLLECTED':                                  '#22c55e', // green
  'No further visits required':                 '#22c55e', // green
  'Too Tall':                                   '#22c55e', // green
  'Refly':                                      '#7c3aed', // purple
  'Refly Further Coordination Required':        '#a855f7', // lighter purple
  'Cancelled by customer':                      '#94a3b8', // grey
  'MOB FEE':                                    '#06b6d4', // cyan
  'Waiting on a COA':                            '#f97316', // orange
  'Not Authorized for inspection yet':           '#60a5fa', // blue
  'SBA Site Waiting on Authorization':           '#f97316', // orange
  'Bird Site':                                   '#3b82f6', // blue
  'Ready But Not Assigned':                      '#db2777', // pink
  'COA Approved and attached':                   '#ef4444', // red (matches Airtable's own color for this choice)
  'Testing pilot app':                           '#ec4899', // pink
  'Pilot':                                       '#475569', // dark grey
}

export function colorForMapColor(mapColor) {
  return MAP_COLOR_HEX[mapColor] || null
}

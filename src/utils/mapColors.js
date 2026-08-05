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

// A site counts as "needs a reflight" from either signal — the office-set REFLY
// checkbox, or the Map Color already flagging it. Single source of truth used
// by SiteDetail (mandatory access form before marking Collected), SiteList
// (bulk-collect exclusion + row badge), and EODReport (reflights site picker).
// MapView/AdminView/AdminSiteDetail keep their own copies of this same check —
// display-only usages that don't gate an action, lower risk to leave alone.
export function isReflySite(site) {
  return !!site.refly || site.mapColor === 'Refly' || site.mapColor === 'Refly Further Coordination Required'
}

// A site needs a completed access form before it can be marked Collected if
// either: it's office-flagged as a refly (see isReflySite above), OR the
// pilot is recollecting it today after it was previously left as Partial or
// MOB Fee — Joe's reasoning is the same in both cases: whatever access was
// arranged for the earlier visit doesn't automatically cover a second one,
// so the office needs a fresh access-form submission on file. `currentStatus`
// is the site's status ('collected' | 'partial' | 'mob' | 'none') from
// *before* the pilot's tap is applied — pass the pre-update value, not what
// it's about to become. Used by SiteDetail (single-site gating) and
// SiteList (bulk-collect exclusion).
export function needsAccessFormToCollect(site, currentStatus) {
  return isReflySite(site) || currentStatus === 'partial' || currentStatus === 'mob'
}

// Which Map Color choices count as "done" for progress counts (chip strip fractions,
// the pilot app's progress bar, List filter tabs, etc.) — only the unambiguous ones.
// Everything else falls back to the pilot-toggled Collected (App) / Partial Collection
// / Mob Fee checkboxes, same as before.
const MAP_COLOR_BUCKET = {
  'Collected':        'collected',
  'COLLECTED':        'collected',
  'Partial':          'partial',
  'Partial Further Coordination Required': 'partial',
  'MOB FEE':          'mob',
}

// Map Color values that mean "still needs a flight," even if a stale Collected (App)
// checkbox says otherwise (e.g. it was collected once, then flagged bad and needs a
// reflight) — these always count as NOT done, overriding the checkboxes.
const MAP_COLOR_NOT_DONE = new Set(['Refly', 'Refly Further Coordination Required'])

export function bucketForMapColor(mapColor) {
  return MAP_COLOR_BUCKET[mapColor] || null
}

// Single source of truth for a site's progress bucket: 'collected' | 'partial' | 'mob'
// | null (still pending). Map Color wins when it's one of the unambiguous statuses or
// a "needs reflight" status; otherwise falls back to the pilot's own checkboxes.
export function statusBucketForSite(site) {
  if (MAP_COLOR_NOT_DONE.has(site.mapColor)) return null
  const mcBucket = bucketForMapColor(site.mapColor)
  if (mcBucket) return mcBucket
  if (site.collectedApp) return 'collected'
  if (site.partialCollection) return 'partial'
  if (site.mobFee) return 'mob'
  return null
}

export function isSiteDone(site) {
  return statusBucketForSite(site) !== null
}

// ── Pin/dot display color (Map + Admin views) ───────────────────────────────────
//
// When a pilot updates a site's status in the app, we want the pin to reflect
// that immediately instead of waiting for the office to update Map Color in
// Airtable by hand — which can take days. But Map Color is still the more
// authoritative, richer status (Refly, Bird Site, Waiting on a COA, etc.), so
// the pilot's update should only "win" temporarily: 24 hours from the moment
// they tapped it (`App Status Set At`, stamped by api/update-site.js), then the
// pin falls back to Map Color like normal. If the office updates Map Color to
// match before the 24 hours are up, this is a no-op — same color either way.

const OVERRIDE_WINDOW_MS = 24 * 60 * 60 * 1000

const PILOT_STATUS_COLORS = {
  collected: '#22c55e',
  partial: '#facc15',
  mob: '#f97316',
  none: '#ef4444',
}

function pilotStatusBucket(site) {
  if (site.collectedApp) return 'collected'
  if (site.partialCollection) return 'partial'
  if (site.mobFee) return 'mob'
  return 'none'
}

function appOverrideActive(site) {
  if (!site.appStatusUpdatedAt) return false
  const age = Date.now() - new Date(site.appStatusUpdatedAt).getTime()
  return age >= 0 && age < OVERRIDE_WINDOW_MS
}

// Single source of truth for pin/dot color everywhere a site is drawn (pilot Map,
// Admin Map, Admin List). Priority: 1) pilot's in-app status update if made in the
// last 24h, 2) Airtable's office-maintained Map Color, 3) pilot's checkboxes with
// no time limit, for sites Map Color was never set on at all.
export function colorForSite(site) {
  if (appOverrideActive(site)) return PILOT_STATUS_COLORS[pilotStatusBucket(site)]
  return colorForMapColor(site.mapColor) || PILOT_STATUS_COLORS[pilotStatusBucket(site)]
}

// ── Route planning eligibility (RouteView.jsx "Plan My Route") ─────────────────
//
// Which Map Color statuses a pilot can even consider when self-planning a
// route. Deliberately permissive per Joe: office Map Color can be stale, and
// the pilot has ground-truth (site tech contact, access, airspace) that isn't
// tracked anywhere else — so the checklist shows almost everything not
// already done, and the pilot decides. Only genuinely non-flyable statuses
// are hidden outright (confirmed with Joe 2026-08-05).
const ROUTE_EXCLUDED_MAP_COLORS = new Set([
  'Cancelled by customer',
  'No further visits required',
  'Too Tall',
  'SBA Site Waiting on Authorization',
  'Not Authorized for inspection yet',
  'Ready But Not Assigned',
])

// A site is routable if it has coordinates, isn't already fully collected
// (office Map Color OR the pilot's own Collected (App) checkbox — either one
// counts as done), and isn't in the small hard-exclude list above.
export function isRouteEligible(site) {
  if (!site.lat || !site.lng) return false
  if (statusBucketForSite(site) === 'collected') return false
  if (ROUTE_EXCLUDED_MAP_COLORS.has(site.mapColor)) return false
  return true
}

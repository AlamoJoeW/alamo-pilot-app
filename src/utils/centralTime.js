// Client-side counterpart to api/_airtable.js's centralDateStr() — same
// reasoning, same fix. Comparing calendar days with device-local Date
// getters (getFullYear/getMonth/getDate) is unsafe here: EOD reports get
// submitted at end-of-shift, right in the window (~7pm-midnight Central)
// where a device's ambient local day and Central's calendar day can
// disagree — roaming, a stale OS timezone, DST edge cases, or a webview
// that silently falls back to UTC. A site marked Collected minutes before
// an EOD submission could land on what the device thinks is a different
// "day" and silently drop out of the EOD's Full/Partial Collection links,
// even though the site's own checkbox was correctly set in Airtable.
// Confirmed as the cause of Lex and Monica's completed (formerly Partial)
// sites missing from their 2026-08-04 EOD reports.
//
// Pinning every "today" comparison to America/Chicago — regardless of what
// timezone the browser/device reports — keeps this consistent with the
// server and removes the device as a variable entirely.
export function centralDateStr(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

// Adds `days` calendar days to a YYYY-MM-DD string via pure UTC date-component
// arithmetic — no timezone conversion, so it can't drift a day off whatever
// centralDateStr() produced (DST transitions, etc. don't apply to plain Y-M-D
// math). Used by RouteView's "Plan Tomorrow's Route" to compute tomorrow's
// Central calendar date from today's, for both the sunrise/sunset calc and
// the date-keyed Daily Assignments record it saves to.
export function addDaysToDateStr(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

// True if the site's last app-status timestamp (APP_STATUS_SET_AT) falls on
// today's Central calendar date. A site's Collected/Partial/MOB checkbox can
// have been true for months — set by the old Airtable form, a legacy data
// import, or a prior day's app action — so this is the one signal that
// actually means "today." Shared by EODReport.jsx (Site Review / Reflights
// sections) and AdminView.jsx (the "today only" toggle).
export function isMarkedToday(site) {
  if (!site.appStatusUpdatedAt) return false
  return centralDateStr(new Date(site.appStatusUpdatedAt)) === centralDateStr()
}

// Formats a Date as a short "as of HH:MM" clock string pinned to Central
// time regardless of device timezone — same reasoning as centralDateStr()
// above. Shared by the on-demand weather check (SiteDetail.jsx) and the
// radar overlay's staleness label (MapView.jsx) so a pilot always sees one
// consistent clock for "how old is this reading," not whatever the device
// happens to think local time is.
export function formatCentralTime(date) {
  if (!date) return ''
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date) + ' CT'
}

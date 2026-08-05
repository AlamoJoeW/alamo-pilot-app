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

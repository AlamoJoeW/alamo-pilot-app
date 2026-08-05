const BASE = ''  // Same origin — Vercel serves both

function getToken() {
  return localStorage.getItem('alamo_token')
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${getToken()}`,
  }
}

export async function login(email, password) {
  const res = await fetch(`${BASE}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Login failed')
  localStorage.setItem('alamo_token', data.token)
  return data
}

export function logout() {
  localStorage.removeItem('alamo_token')
}

export async function changePassword(currentPassword, newPassword) {
  const res = await fetch(`${BASE}/api/change-password`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ currentPassword, newPassword }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401) throw new Error(data.error || 'AUTH_EXPIRED')
    throw new Error(data.error || 'Failed to change password')
  }
  // Server reissues the token with mustChangePassword cleared — store it so
  // the app doesn't re-prompt on the next page load this session.
  if (data.token) localStorage.setItem('alamo_token', data.token)
  return data
}

export function getPilotInfo() {
  const token = getToken()
  if (!token) return null
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    if (payload.exp * 1000 < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

export async function fetchSites() {
  const res = await fetch(`${BASE}/api/sites`, { headers: authHeaders() })
  if (!res.ok) {
    if (res.status === 401) throw new Error('AUTH_EXPIRED')
    throw new Error('Failed to fetch sites')
  }
  return res.json()
}

export async function updateSite(recordId, action) {
  const res = await fetch(`${BASE}/api/update-site`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ recordId, action }),
  })
  if (!res.ok) {
    if (res.status === 401) throw new Error('AUTH_EXPIRED')
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'Update failed')
  }
  return res.json()
}

// Bulk-select in List view — same action applied to many sites in one request.
// Returns { success, results: [{ recordId, ok, error? }] } so the caller can tell
// the pilot which sites actually went through.
export async function updateSitesBulk(recordIds, action) {
  const res = await fetch(`${BASE}/api/update-site`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ recordIds, action }),
  })
  if (!res.ok) {
    if (res.status === 401) throw new Error('AUTH_EXPIRED')
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'Bulk update failed')
  }
  return res.json()
}

export async function updateSiteNotes(recordId, notes) {
  const res = await fetch(`${BASE}/api/update-site`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ recordId, notes }),
  })
  if (!res.ok) {
    if (res.status === 401) throw new Error('AUTH_EXPIRED')
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'Failed to save notes')
  }
  return res.json()
}

// Pin icon shape (Building/Tower/SBA/COA/LAANC as lowercase type strings, or
// null to clear) — synced field, visible in both the pilot map and Admin view.
export async function updateSitePinIcon(recordId, pinIcon) {
  const res = await fetch(`${BASE}/api/update-site`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ recordId, pinIcon }),
  })
  if (!res.ok) {
    if (res.status === 401) throw new Error('AUTH_EXPIRED')
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'Failed to save pin icon')
  }
  return res.json()
}

// `since` (ISO timestamp, optional) restricts the check to access-issue forms
// created after that moment — pass the time the pilot tapped the status
// button, not just any form on file. Without it, an already-existing form
// (e.g. the one that put a site into Partial/MOB in the first place) would
// satisfy the check for a same-day recollect without the pilot actually
// submitting a new one. See SiteDetail.jsx's pendingSince.
export async function checkAccessIssue(siteRecordId, since) {
  const qs = new URLSearchParams({ siteRecordId })
  if (since) qs.set('since', since)
  const res = await fetch(`${BASE}/api/check-access-issue?${qs}`, {
    headers: authHeaders(),
  })
  if (res.status === 401) throw new Error('AUTH_EXPIRED')
  return res.json()
}

export async function submitAccessIssue(recordId, action, notes, file, captureTypes, issueFlags) {
  const body = { recordId, action, notes }
  if (file) {
    body.fileBase64 = file.base64
    body.fileName = file.name
    body.fileMimeType = file.type
  }
  if (captureTypes) body.captureTypes = captureTypes
  if (issueFlags)   body.issueFlags   = issueFlags
  const res = await fetch(`${BASE}/api/access-issue`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    if (res.status === 401) throw new Error('AUTH_EXPIRED')
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'Failed to submit access issue')
  }
  return res.json()
}

export async function fetchEODSummary() {
  const res = await fetch(`${BASE}/api/submit-eod`, { headers: authHeaders() })
  if (!res.ok) throw new Error('Failed to fetch EOD')
  return res.json()
}

// Takes a single payload object (matching what EODReport.jsx's onSubmit already
// builds) rather than a long positional argument list — that list grew to 9
// params across a couple of feature passes and positional mismatches are an
// easy way to silently drop a field (e.g. fullCount/partialCount).
export async function submitEOD(payload) {
  const {
    collectedIds, partialIds, mobIds, reflyIds = [],
    endLat = null, endLng = null, preflightId = null, projectId = null,
    fullCount, partialCount, eodForm = null,
  } = payload
  const res = await fetch(`${BASE}/api/submit-eod`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      collectedIds, partialIds, mobIds, reflyIds,
      endLat, endLng, preflightId, projectId,
      fullCount, partialCount, eodForm,
    }),
  })
  if (!res.ok) {
    if (res.status === 401) throw new Error('AUTH_EXPIRED')
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'EOD submission failed')
  }
  return res.json()
}

// ── Preflight ─────────────────────────────────────────────────────────────────

export async function checkPreflight() {
  const res = await fetch(`${BASE}/api/preflight`, { headers: authHeaders() })
  if (res.status === 401) throw new Error('AUTH_EXPIRED')
  return res.json()
}

export async function updatePreflightLocation(preflightId, lat, lng) {
  const res = await fetch(`${BASE}/api/preflight`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ preflightId, lat, lng }),
  })
  if (res.status === 401) throw new Error('AUTH_EXPIRED')
  return res.json()
}

export async function submitPreflight(data) {
  const res = await fetch(`${BASE}/api/preflight`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  })
  if (res.status === 401) throw new Error('AUTH_EXPIRED')
  return res.json()
}

// ── Aircraft & Projects ────────────────────────────────────────────────────────

export async function fetchAircraft() {
  const res = await fetch(`${BASE}/api/aircraft`, { headers: authHeaders() })
  if (res.status === 401) throw new Error('AUTH_EXPIRED')
  return res.json()
}

export async function fetchProjects() {
  const res = await fetch(`${BASE}/api/projects`, { headers: authHeaders() })
  if (res.status === 401) throw new Error('AUTH_EXPIRED')
  return res.json()
}

// ── Daily Route ────────────────────────────────────────────────────────────────

export async function fetchDailyRoute() {
  const res = await fetch(`${BASE}/api/daily-route`, { headers: authHeaders() })
  if (res.status === 401) throw new Error('AUTH_EXPIRED')
  return res.json()
}

// Writes a pilot-generated route (built client-side in routePlanner.js) back
// to the same Daily Assignments table/fields the pilot-daily-schedule skill
// writes to, so Admin/office still sees each pilot's planned route for the day.
export async function saveDailyRoute(route) {
  const res = await fetch(`${BASE}/api/daily-route`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ route }),
  })
  if (res.status === 401) throw new Error('AUTH_EXPIRED')
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Failed to save route')
  return data
}

// ── Admin ─────────────────────────────────────────────────────────────────────
// Sites + pilot locations are served from one combined endpoint (api/admin.js) to
// stay under Vercel's Hobby-plan 12-serverless-function limit.

export async function fetchAdminData() {
  const res = await fetch(`${BASE}/api/admin`, { headers: authHeaders() })
  if (!res.ok) {
    if (res.status === 401) throw new Error('AUTH_EXPIRED')
    if (res.status === 403) throw new Error('FORBIDDEN')
    throw new Error('Failed to fetch admin data')
  }
  return res.json()
}

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

export async function checkAccessIssue(siteRecordId) {
  const res = await fetch(`${BASE}/api/check-access-issue?siteRecordId=${encodeURIComponent(siteRecordId)}`, {
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

export async function submitEOD(
  collectedIds,
  partialIds,
  mobIds,
  endLat = null,
  endLng = null,
  preflightId = null,
  eodForm = null
) {
  const res = await fetch(`${BASE}/api/submit-eod`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ collectedIds, partialIds, mobIds, endLat, endLng, preflightId, eodForm }),
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

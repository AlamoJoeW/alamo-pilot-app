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

export async function submitAccessIssue(recordId, action, notes, file) {
  const body = { recordId, action, notes }
  if (file) {
    body.fileBase64 = file.base64
    body.fileName = file.name
    body.fileMimeType = file.type
  }
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

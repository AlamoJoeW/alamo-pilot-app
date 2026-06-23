import { useState, useEffect, useCallback } from 'react'
import Login from './components/Login'
import MapView from './components/MapView'
import RouteView from './components/RouteView'
import SiteList from './components/SiteList'
import SiteDetail from './components/SiteDetail'
import {
  getPilotInfo,
  fetchSites,
  updateSite,
  logout,
  checkPreflight,
} from './utils/api'
import {
  saveSites,
  getSites,
  updateSiteLocally,
  queueUpdate,
  getPendingUpdates,
  deletePendingUpdate,
  getMeta,
  clearAll,
} from './utils/db'

const EOD_FORM_URL = 'https://airtable.com/app3uLCFgt3Y0aPaa/shriKnuzFRkspxTOE'
const PREFLIGHT_FORM_URL = 'https://airtable.com/app3uLCFgt3Y0aPaa/shrvIwEMGXL6NBl4k'

function PreflightPrompt({ pilot, onCheck, onLogout }) {
  const [checking, setChecking] = useState(false)

  async function handleCheck() {
    setChecking(true)
    await onCheck()
    setChecking(false)
  }

  return (
    <div className="preflight-screen" style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ textAlign: 'center', padding: 32 }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>✈️</div>
        <h2 style={{ marginBottom: 8 }}>Daily Preflight Required</h2>
        <p style={{ color: 'var(--text2)', marginBottom: 32 }}>
          No preflight on file for today, {pilot?.firstName || pilot?.displayName}. Complete the form before flying.
        </p>
        <button
          className="btn-primary btn-full"
          style={{ marginBottom: 12 }}
          onClick={() => window.open(PREFLIGHT_FORM_URL, '_blank')}
        >
          Open Preflight Form
        </button>
        <button
          className="btn-secondary btn-full"
          style={{ marginBottom: 12 }}
          onClick={handleCheck}
          disabled={checking}
        >
          {checking ? 'Checking…' : "I've Completed My Preflight"}
        </button>
        <button className="btn-secondary" onClick={onLogout}>Log Out</button>
      </div>
    </div>
  )
}

function TravelDayScreen({ pilot, onLogout }) {
  return (
    <div className="preflight-screen" style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ textAlign: 'center', padding: 32 }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🚗</div>
        <h2 style={{ marginBottom: 8 }}>Travel Day</h2>
        <p style={{ color: 'var(--text2)', marginBottom: 32 }}>
          No flight operations scheduled. Safe travels, {pilot?.firstName}!
        </p>
        <button className="btn-secondary" onClick={onLogout}>Log Out</button>
      </div>
    </div>
  )
}

export default function App() {
  const [pilot, setPilot] = useState(null)
  const [sites, setSites] = useState([])
  const [view, setView] = useState('map')          // 'map' | 'list'
  const [filter, setFilter] = useState('all')
  const [selectedSite, setSelectedSite] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState('')
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [pendingCount, setPendingCount] = useState(0)
  const [syncedAt, setSyncedAt] = useState(null)

  // Preflight state
  const [preflightChecked, setPreflightChecked] = useState(false)
  const [preflightExists, setPreflightExists] = useState(false)
  const [preflightTravelDay, setPreflightTravelDay] = useState(false)
  const [preflightId, setPreflightId] = useState(null)

  // Online/offline detection
  useEffect(() => {
    const on = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  // Check auth on mount
  useEffect(() => {
    const info = getPilotInfo()
    if (info) {
      setPilot(info)
      loadFromCache()
      checkAndSetPreflight()
      sync()
    }
  }, [])

  // Flush pending updates when coming online
  useEffect(() => {
    if (isOnline && pilot) {
      flushPending()
    }
  }, [isOnline, pilot])

  async function loadFromCache() {
    const cached = await getSites()
    if (cached.length > 0) {
      setSites(cached)
    }
    const at = await getMeta('syncedAt')
    if (at) setSyncedAt(at)
    const pending = await getPendingUpdates()
    setPendingCount(pending.length)
  }

  // Check Airtable for today's preflight — called explicitly on every login event
  async function checkAndSetPreflight() {
    setPreflightChecked(false)
    try {
      const pf = await checkPreflight()
      setPreflightExists(pf.exists)
      setPreflightTravelDay(pf.travelDay || false)
      setPreflightId(pf.preflightId || null)
    } catch {
      // Non-fatal — default to showing the form so pilot can submit
      setPreflightExists(false)
    } finally {
      setPreflightChecked(true)
    }
  }

  async function sync() {
    if (syncing) return
    setSyncing(true)
    setSyncError('')
    try {
      const data = await fetchSites()
      await saveSites(data.sites)
      setSites(data.sites)
      setSyncedAt(data.syncedAt)
      await flushPending()
    } catch (err) {
      if (err.message === 'AUTH_EXPIRED') {
        handleLogout()
      } else {
        setSyncError('Sync failed — using cached data')
      }
    } finally {
      setSyncing(false)
    }
  }

  async function flushPending() {
    const pending = await getPendingUpdates()
    if (pending.length === 0) return

    let flushed = 0
    for (const { key, value } of pending) {
      try {
        await updateSite(value.recordId, value.action)
        await deletePendingUpdate(key)
        flushed++
      } catch {
        break // Stop on first failure (network issue)
      }
    }

    const remaining = await getPendingUpdates()
    setPendingCount(remaining.length)

    if (flushed > 0) {
      // Re-sync to get fresh data
      const data = await fetchSites().catch(() => null)
      if (data) {
        await saveSites(data.sites)
        setSites(data.sites)
      }
    }
  }

  const handleUpdate = useCallback(async (recordId, action) => {
    // Optimistic local update
    const changes = {
      collectedApp: action === 'collected',
      partialCollection: action === 'partial',
      mobFee: action === 'mob',
    }
    if (action === 'uncollect') {
      changes.collectedApp = false
      changes.partialCollection = false
      changes.mobFee = false
    }

    await updateSiteLocally(recordId, changes)
    setSites(prev => prev.map(s => s.id === recordId ? { ...s, ...changes } : s))
    if (selectedSite?.id === recordId) {
      setSelectedSite(prev => ({ ...prev, ...changes }))
    }

    if (isOnline) {
      try {
        await updateSite(recordId, action)
      } catch (err) {
        // If network fails, queue it
        await queueUpdate({ recordId, action })
        setPendingCount(n => n + 1)
      }
    } else {
      await queueUpdate({ recordId, action })
      setPendingCount(n => n + 1)
    }
  }, [isOnline, selectedSite])

  function handleLogout() {
    logout()
    clearAll()
    setPilot(null)
    setSites([])
    setSelectedSite(null)
    setPreflightChecked(false)
    setPreflightExists(false)
    setPreflightTravelDay(false)
    setPreflightId(null)
  }

  function handleLogin(data) {
    const info = getPilotInfo()
    setPilot(info || data)
    checkAndSetPreflight()
    sync()
  }

  // ── Render guards ─────────────────────────────────────────────────────────────

  // No auth → Login
  if (!pilot) {
    return <Login onLogin={handleLogin} />
  }

  // Auth OK but preflight not yet checked → brief loading state
  if (!preflightChecked) {
    return <div className="pf-loading">Checking preflight…</div>
  }

  // Auth OK + preflight not done → prompt pilot to open Airtable form
  if (!preflightExists) {
    return (
      <PreflightPrompt
        pilot={pilot}
        onCheck={checkAndSetPreflight}
        onLogout={handleLogout}
      />
    )
  }

  // Auth OK + travel day → Travel Day screen (no route/map)
  if (preflightTravelDay) {
    return <TravelDayScreen pilot={pilot} onLogout={handleLogout} />
  }

  // Normal flight day → map/list/EOD
  const collectedCount = sites.filter(s => s.collectedApp).length
  const partialCount = sites.filter(s => s.partialCollection).length
  const mobCount = sites.filter(s => s.mobFee).length
  const doneCount = collectedCount + partialCount + mobCount

  return (
    <div className="app">
      {/* Top bar */}
      <header className="top-bar">
        <div className="top-bar-left">
          <span className="pilot-name">{pilot.firstName || pilot.displayName}</span>
          {!isOnline && <span className="offline-pill">Offline</span>}
          {pendingCount > 0 && <span className="pending-pill">{pendingCount} pending</span>}
        </div>
        <div className="top-bar-right">
          <button className="icon-btn" onClick={sync} disabled={syncing} title="Sync">
            {syncing ? '⏳' : '⟳'}
          </button>
          <button className="icon-btn" onClick={handleLogout} title="Log out">⎋</button>
        </div>
      </header>

      {syncError && <div className="sync-error">{syncError}</div>}

      {/* Progress bar */}
      <div className="progress-bar">
        <div className="progress-stats">
          <span>{doneCount} / {sites.length} sites</span>
          <span style={{ color: '#22c55e' }}>{collectedCount} collected</span>
          {partialCount > 0 && <span style={{ color: '#facc15' }}>{partialCount} partial</span>}
          {mobCount > 0 && <span style={{ color: '#f97316' }}>{mobCount} MOB</span>}
        </div>
        <div className="progress-track">
          <div
            className="progress-fill"
            style={{ width: sites.length > 0 ? `${(doneCount / sites.length) * 100}%` : '0%' }}
          />
        </div>
      </div>

      {/* View toggle */}
      <div className="view-toggle">
        <button
          className={`toggle-btn ${view === 'map' ? 'active' : ''}`}
          onClick={() => setView('map')}
        >
          Map
        </button>
        <button
          className={`toggle-btn ${view === 'route' ? 'active' : ''}`}
          onClick={() => setView('route')}
        >
          Route
        </button>
        <button
          className={`toggle-btn ${view === 'list' ? 'active' : ''}`}
          onClick={() => setView('list')}
        >
          List
        </button>
      </div>

      {/* Main content */}
      <div className="main-content">
        {view === 'map' && <MapView sites={sites} onSelect={setSelectedSite} />}
        {view === 'route' && <RouteView sites={sites} />}
        {view === 'list' && (
          <SiteList
            sites={sites}
            onSelect={setSelectedSite}
            filter={filter}
            onFilterChange={setFilter}
          />
        )}
      </div>

      {/* EOD Report button — always visible */}
      <button className="eod-btn" onClick={() => window.open(EOD_FORM_URL, '_blank')}>
        End of Day Report
      </button>

      {/* Site detail sheet */}
      {selectedSite && (
        <SiteDetail
          site={selectedSite}
          onClose={() => setSelectedSite(null)}
          onUpdate={handleUpdate}
          isOnline={isOnline}
          pendingCount={pendingCount}
        />
      )}

    </div>
  )
}

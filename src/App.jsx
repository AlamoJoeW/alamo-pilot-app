import { useState, useEffect, useCallback } from 'react'
import Login from './components/Login'
import MapView from './components/MapView'
import RouteView from './components/RouteView'
import SiteList from './components/SiteList'
import SiteDetail from './components/SiteDetail'
import Preflight from './components/Preflight'
import EODReport from './components/EODReport'
import {
  getPilotInfo,
  fetchSites,
  updateSite,
  submitEOD,
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
  const [showEODForm, setShowEODForm] = useState(false)
  const [eodResult, setEodResult] = useState(null)  // null | { success } | { error }
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

  async function handleEODSubmit({ collectedIds, partialIds, mobIds, preflightId: pfId, eodForm }) {
    // Capture end-of-day GPS (optional, non-blocking)
    let endLat = null, endLng = null
    if (navigator.geolocation) {
      await new Promise(resolve => {
        navigator.geolocation.getCurrentPosition(
          pos => { endLat = pos.coords.latitude; endLng = pos.coords.longitude; resolve() },
          () => resolve()
        )
      })
    }

    try {
      const result = await submitEOD(collectedIds, partialIds, mobIds, endLat, endLng, pfId || preflightId, eodForm)
      setEodResult({ success: true, ...result })
      setShowEODForm(false)
    } catch (err) {
      if (err.message === 'AUTH_EXPIRED') { handleLogout(); return }
      throw err  // Let EODReport show the error
    }
  }

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

  // Auth OK + preflight not done → show Preflight form
  if (!preflightExists) {
    return (
      <Preflight
        pilot={pilot}
        onComplete={(id) => {
          setPreflightId(id)
          setPreflightExists(true)
        }}
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

      {/* Submit EOD button */}
      {doneCount > 0 && (
        <button className="eod-btn" onClick={() => setShowEODForm(true)}>
          {`Submit EOD (${doneCount} sites)`}
        </button>
      )}

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

      {/* EOD form — full screen, like Preflight */}
      {showEODForm && (
        <EODReport
          pilot={pilot}
          sites={sites}
          preflightId={preflightId}
          onSubmit={handleEODSubmit}
          onCancel={() => setShowEODForm(false)}
        />
      )}

      {/* EOD success banner */}
      {eodResult?.success && (
        <div className="modal-overlay" onClick={() => setEodResult(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>EOD Submitted</h2>
            <p style={{ color: 'var(--text2)', marginBottom: 16 }}>
              Your end-of-day report has been submitted to Airtable.
            </p>
            <button className="btn-primary" onClick={() => setEodResult(null)}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

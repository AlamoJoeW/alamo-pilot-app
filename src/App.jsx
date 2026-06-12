import { useState, useEffect, useCallback } from 'react'
import Login from './components/Login'
import MapView from './components/MapView'
import SiteList from './components/SiteList'
import SiteDetail from './components/SiteDetail'
import {
  getPilotInfo,
  fetchSites,
  updateSite,
  submitEOD,
  logout,
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
  const [eodSummary, setEodSummary] = useState(null)
  const [showEOD, setShowEOD] = useState(false)
  const [eodSubmitting, setEodSubmitting] = useState(false)
  const [syncedAt, setSyncedAt] = useState(null)

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
        return
      }
      setSyncError('Sync failed — using cached data')
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

  async function handleEOD() {
    if (eodSubmitting) return
    setEodSubmitting(true)
    try {
      const collectedIds = sites.filter(s => s.collectedApp).map(s => s.id)
      const partialIds = sites.filter(s => s.partialCollection).map(s => s.id)
      const mobIds = sites.filter(s => s.mobFee).map(s => s.id)
      const summary = await submitEOD(collectedIds, partialIds, mobIds)
      setEodSummary(summary)
      setShowEOD(true)
    } catch (err) {
      if (err.message === 'AUTH_EXPIRED') { handleLogout(); return }
      setEodSummary({ error: err.message || 'Submission failed' })
      setShowEOD(true)
    } finally {
      setEodSubmitting(false)
    }
  }

  function handleLogout() {
    logout()
    clearAll()
    setPilot(null)
    setSites([])
    setSelectedSite(null)
  }

  function handleLogin(data) {
    const info = getPilotInfo()
    setPilot(info || data)
    sync()
  }

  if (!pilot) {
    return <Login onLogin={handleLogin} />
  }

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
          className={`toggle-btn ${view === 'list' ? 'active' : ''}`}
          onClick={() => setView('list')}
        >
          List
        </button>
      </div>

      {/* Main content */}
      <div className="main-content">
        {view === 'map' ? (
          <MapView sites={sites} onSelect={setSelectedSite} />
        ) : (
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
        <button className="eod-btn" onClick={handleEOD} disabled={eodSubmitting}>
          {eodSubmitting ? 'Submitting…' : `Submit EOD (${doneCount} sites)`}
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

      {/* EOD confirmation modal */}
      {showEOD && (
        <div className="modal-overlay" onClick={() => setShowEOD(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>End of Day Report</h2>
            {eodSummary?.error ? (
              <p style={{ color: '#ef4444' }}>Error: {eodSummary.error}</p>
            ) : eodSummary ? (
              <>
                <div className="eod-summary">
                  <div className="eod-row">
                    <span>Full Collections</span>
                    <strong style={{ color: '#22c55e' }}>{eodSummary.fullCount}</strong>
                  </div>
                  <div className="eod-row">
                    <span>Partial Collections</span>
                    <strong style={{ color: '#facc15' }}>{eodSummary.partialCount}</strong>
                  </div>
                  <div className="eod-row">
                    <span>MOB Fees</span>
                    <strong style={{ color: '#f97316' }}>{eodSummary.mobCount}</strong>
                  </div>
                </div>
                <p className="eod-note">
                  EOD report submitted to Airtable. Your supervisor can review it there.
                </p>
              </>
            ) : (
              <p>Submitting…</p>
            )}
            <button className="btn-primary" onClick={() => setShowEOD(false)}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

import { useState, useEffect, useCallback } from 'react'
import Login from './components/Login'
import MapView from './components/MapView'
import RouteView from './components/RouteView'
import SiteList from './components/SiteList'
import SiteDetail from './components/SiteDetail'
import AdminView from './components/AdminView'
import ChangePassword from './components/ChangePassword'
import EODReport from './components/EODReport'
import { statusBucketForSite } from './utils/mapColors'
import {
  getPilotInfo,
  fetchSites,
  updateSite,
  updateSitesBulk,
  updateSiteNotes,
  updateSitePinIcon,
  logout,
  checkPreflight,
  updatePreflightLocation,
  submitEOD,
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

const PREFLIGHT_FORM_URL = 'https://airtable.com/app3uLCFgt3Y0aPaa/shrvIwEMGXL6NBl4k'

export default function App() {
  const [pilot, setPilot] = useState(null)
  // Kept in memory only (never persisted) — the password just typed on the
  // login screen, reused to submit a forced first-login password change
  // without asking the pilot to retype it.
  const [pendingPassword, setPendingPassword] = useState('')
  const [sites, setSites] = useState([])
  const [view, setView] = useState('map')          // 'map' | 'list'
  const [filter, setFilter] = useState('all')
  const [selectedSite, setSelectedSite] = useState(null)
  // The last site tapped on the Map — kept separate from `selectedSite` so
  // closing the detail sheet (setSelectedSite(null)) doesn't clear the pin
  // highlight/tooltip. Only replaced when a different site is selected.
  const [highlightedSiteId, setHighlightedSiteId] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState('')
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [pendingCount, setPendingCount] = useState(0)
  const [syncedAt, setSyncedAt] = useState(null)
  const [showEOD, setShowEOD] = useState(false)
  const [projectId, setProjectId] = useState(null)

  // Preflight state
  const [preflightChecked, setPreflightChecked] = useState(false)
  const [preflightExists, setPreflightExists] = useState(false)
  const [preflightTravelDay, setPreflightTravelDay] = useState(false)
  const [preflightId, setPreflightId] = useState(null)
  const [preflightRechecking, setPreflightRechecking] = useState(false)

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

  // Periodic location ping while the app is open with a preflight on file, so the
  // Admin view can show a reasonably current position instead of a once-a-day snapshot.
  useEffect(() => {
    if (!preflightExists || !preflightId || !navigator.geolocation) return
    const pingLocation = () => {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          updatePreflightLocation(preflightId, coords.latitude, coords.longitude).catch(() => {})
        },
        () => {},
        { enableHighAccuracy: false, timeout: 10000 }
      )
    }
    const interval = setInterval(pingLocation, 6 * 60 * 1000)
    return () => clearInterval(interval)
  }, [preflightExists, preflightId])

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

  // Pin icon shape — a synced Airtable field (App Pin Icon), not a per-device
  // preference, so it shows up in Admin too. Same optimistic-update + offline-
  // queue pattern as handleNotesSave below.
  const handlePinIconChange = useCallback(async (recordId, iconType) => {
    await updateSiteLocally(recordId, { pinIcon: iconType })
    setSites(prev => prev.map(s => s.id === recordId ? { ...s, pinIcon: iconType } : s))
    setSelectedSite(prev => prev?.id === recordId ? { ...prev, pinIcon: iconType } : prev)

    if (isOnline) {
      try {
        await updateSitePinIcon(recordId, iconType)
      } catch (err) {
        await queueUpdate({ recordId, pinIcon: iconType })
        setPendingCount(n => n + 1)
      }
    } else {
      await queueUpdate({ recordId, pinIcon: iconType })
      setPendingCount(n => n + 1)
    }
  }, [isOnline])

  // Check Airtable for today's preflight — called explicitly on every login event
  async function checkAndSetPreflight() {
    setPreflightChecked(false)
    try {
      const pf = await checkPreflight()
      setPreflightExists(pf.exists)
      setPreflightTravelDay(pf.travelDay || false)
      setPreflightId(pf.preflightId || null)
      // The project the pilot actually picked on today's preflight — not a
      // guess. Alamo pilots work across 15+ regional Verizon projects, so the
      // EOD must link to whichever one this pilot is actually on today.
      setProjectId(pf.projectId || null)

      // Silently update Current Latitude/Longitude on the preflight record
      if (pf.exists && pf.preflightId && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          ({ coords }) => {
            updatePreflightLocation(pf.preflightId, coords.latitude, coords.longitude).catch(() => {})
          },
          () => {} // fail silently if GPS unavailable
        )
      }
    } catch {
      // Non-fatal — default to showing the form so pilot can submit
      setPreflightExists(false)
    } finally {
      setPreflightChecked(true)
    }
  }

  async function handleRecheckPreflight() {
    setPreflightRechecking(true)
    await checkAndSetPreflight()
    setPreflightRechecking(false)
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
        if (value.notes !== undefined) {
          await updateSiteNotes(value.recordId, value.notes)
        } else if (value.pinIcon !== undefined) {
          await updateSitePinIcon(value.recordId, value.pinIcon)
        } else {
          await updateSite(value.recordId, value.action)
        }
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
    // Stamp locally, same as handleBulkUpdate below — otherwise this site's
    // "marked today" state (used by EODReport's isMarkedToday check) doesn't
    // exist until the server round-trip in updateSite() below completes and
    // a later sync() pulls it back down. On poor cell service that round-trip
    // can lag or silently fail, so a pilot who marks a site collected and
    // submits their EOD shortly after (before that sync happens) would have
    // the site drop out of the EOD's collected list even though it's flagged
    // collected locally. Stamping here makes "today" true immediately,
    // independent of connectivity.
    changes.appStatusUpdatedAt = new Date().toISOString()

    await updateSiteLocally(recordId, changes)
    setSites(prev => prev.map(s => s.id === recordId ? { ...s, ...changes } : s))
    setSelectedSite(prev => prev?.id === recordId ? { ...prev, ...changes } : prev)

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

  // Bulk-select in List view — same status action applied to many sites at once.
  // Partial/MOB access-form gating already happened in SiteList before this is
  // called, so by the time we get here every id is meant to actually be applied.
  const handleBulkUpdate = useCallback(async (recordIds, action) => {
    const changes = {
      collectedApp: action === 'collected',
      partialCollection: action === 'partial',
      mobFee: action === 'mob',
    }
    const stampedAt = new Date().toISOString()

    await Promise.all(recordIds.map(id => updateSiteLocally(id, { ...changes, appStatusUpdatedAt: stampedAt })))
    setSites(prev => prev.map(s => recordIds.includes(s.id) ? { ...s, ...changes, appStatusUpdatedAt: stampedAt } : s))

    if (isOnline) {
      try {
        await updateSitesBulk(recordIds, action)
      } catch (err) {
        // Network-level failure — queue every site individually so the whole
        // batch isn't lost, same as the single-site offline path.
        for (const id of recordIds) {
          await queueUpdate({ recordId: id, action })
        }
        setPendingCount(n => n + recordIds.length)
      }
    } else {
      for (const id of recordIds) {
        await queueUpdate({ recordId: id, action })
      }
      setPendingCount(n => n + recordIds.length)
    }
  }, [isOnline])

  // Inline Notes edit from the List view.
  const handleNotesSave = useCallback(async (recordId, notes) => {
    await updateSiteLocally(recordId, { notes })
    setSites(prev => prev.map(s => s.id === recordId ? { ...s, notes } : s))
    setSelectedSite(prev => prev?.id === recordId ? { ...prev, notes } : prev)

    if (isOnline) {
      try {
        await updateSiteNotes(recordId, notes)
      } catch (err) {
        await queueUpdate({ recordId, notes })
        setPendingCount(n => n + 1)
      }
    } else {
      await queueUpdate({ recordId, notes })
      setPendingCount(n => n + 1)
    }
  }, [isOnline])

  // Opens the detail sheet AND marks the site as the map's persistent
  // highlight — unlike `selectedSite`, this survives closing the sheet, so
  // the pin the pilot just tapped stays visually distinguishable until they
  // tap a different one. useCallback keeps this referentially stable across
  // renders — MapView's marker-build effect depends on `onSelect`, and an
  // inline function here would rebuild every marker (and re-fit the map)
  // on every unrelated App re-render.
  const handleSelectSite = useCallback(site => {
    setSelectedSite(site)
    setHighlightedSiteId(site.id)
  }, [])

  async function handleEODSubmit(payload) {
    await submitEOD(payload)
    setShowEOD(false)
    // Re-sync so the office-side view (and this pilot's own progress bar) reflects
    // whatever the EOD just wrote.
    sync()
  }

  function handleLogout() {
    logout()
    clearAll()
    setPilot(null)
    setSites([])
    setSelectedSite(null)
    setView('map')
    setShowEOD(false)
    setPreflightChecked(false)
    setPreflightExists(false)
    setPreflightTravelDay(false)
    setPreflightId(null)
    setPreflightRechecking(false)
    setProjectId(null)
  }

  function handleLogin(data, password) {
    const info = getPilotInfo()
    setPilot(info || data)
    if (password) setPendingPassword(password)
    checkAndSetPreflight()
    sync()
  }

  function handlePasswordChanged() {
    const info = getPilotInfo()
    setPilot(info)
    setPendingPassword('')
  }

  // ── Render guards ─────────────────────────────────────────────────────────────

  // No auth → Login
  if (!pilot) {
    return <Login onLogin={handleLogin} />
  }

  // Still on the initial/temporary password → force a change before anything
  // else in the app is reachable (no Map/List peek, no Cancel button).
  if (pilot.mustChangePassword) {
    return (
      <ChangePassword
        forced
        initialCurrentPassword={pendingPassword}
        onDone={handlePasswordChanged}
      />
    )
  }

  // Auth OK but preflight not yet checked → brief loading state
  if (!preflightChecked) {
    return <div className="pf-loading">Checking preflight…</div>
  }

  // Pilots can view Map/List without a completed preflight, but can't log
  // site status (or see Route/EOD) until preflight is submitted for today
  // and it isn't a travel day.
  const canEdit = preflightExists && !preflightTravelDay

  // Full-screen EOD wizard, submitted directly from the app instead of opening
  // the Airtable form in a new tab.
  if (showEOD) {
    return (
      <EODReport
        pilot={pilot}
        sites={sites}
        preflightId={preflightId}
        projectId={projectId}
        onSubmit={handleEODSubmit}
        onCancel={() => setShowEOD(false)}
      />
    )
  }

  // Map Color (office-maintained status) counts as done when it's unambiguous, so
  // sites collected/marked outside the app's own checkboxes still show as progress.
  const collectedCount = sites.filter(s => statusBucketForSite(s) === 'collected').length
  const partialCount = sites.filter(s => statusBucketForSite(s) === 'partial').length
  const mobCount = sites.filter(s => statusBucketForSite(s) === 'mob').length
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

      {/* Preflight gate banner — hidden on the Admin tab. Admins (e.g. Joe's boss)
          view all-pilot data there and don't need a nag about their own personal
          preflight; AdminView shows a small "(no Preflight)" tag per pilot instead. */}
      {view !== 'admin' && !preflightExists && (
        <div className="preflight-banner">
          <span>Preflight required before logging site status.</span>
          <div className="preflight-banner-btns">
            <button className="btn-check-again" onClick={() => window.open(PREFLIGHT_FORM_URL, '_blank')}>
              Open Form
            </button>
            <button className="btn-check-again" onClick={handleRecheckPreflight} disabled={preflightRechecking}>
              {preflightRechecking ? 'Checking…' : "I've Submitted It"}
            </button>
          </div>
        </div>
      )}
      {view !== 'admin' && preflightExists && preflightTravelDay && (
        <div className="preflight-banner travel-day">
          <span>🚗 Travel Day — no flight ops scheduled today. Map is read-only.</span>
        </div>
      )}

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
          onClick={() => preflightExists && setView('route')}
          disabled={!preflightExists}
          title={!preflightExists ? 'Complete preflight to unlock Route' : ''}
        >
          Route
        </button>
        <button
          className={`toggle-btn ${view === 'list' ? 'active' : ''}`}
          onClick={() => setView('list')}
        >
          List
        </button>
        {pilot.isAdmin && (
          <button
            className={`toggle-btn ${view === 'admin' ? 'active' : ''}`}
            onClick={() => setView('admin')}
          >
            Admin
          </button>
        )}
      </div>

      {/* Main content */}
      <div className="main-content">
        {view === 'map' && <MapView sites={sites} onSelect={handleSelectSite} highlightedSiteId={highlightedSiteId} />}
        {view === 'route' && (preflightExists ? <RouteView sites={sites} /> : <MapView sites={sites} onSelect={handleSelectSite} highlightedSiteId={highlightedSiteId} />)}
        {view === 'list' && (
          <SiteList
            sites={sites}
            onSelect={handleSelectSite}
            filter={filter}
            onFilterChange={setFilter}
            onBulkUpdate={handleBulkUpdate}
            onNotesSave={handleNotesSave}
            canEdit={canEdit}
            isOnline={isOnline}
          />
        )}
        {view === 'admin' && pilot.isAdmin && <AdminView />}
      </div>

      {/* EOD Report button — requires preflight and not a travel day. Hidden on
          the Route tab (Joe: route planning and EOD are separate workflows,
          and the pep-talk footer sits where this button would go). */}
      {view !== 'route' && (
        <button
          className="eod-btn"
          onClick={() => canEdit && setShowEOD(true)}
          disabled={!canEdit}
          title={!canEdit ? 'Complete preflight to submit an EOD report' : ''}
        >
          End of Day Report
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
          canEdit={canEdit}
          onPinIconChange={handlePinIconChange}
          onNotesSave={handleNotesSave}
        />
      )}

    </div>
  )
}

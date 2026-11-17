import { useState, useEffect, useCallback, useRef } from 'react'
import Login from './components/Login'
import MapView from './components/MapView'
import RouteView from './components/RouteView'
import SiteList from './components/SiteList'
import SiteDetail from './components/SiteDetail'
import AdminView from './components/AdminView'
import ChangePassword from './components/ChangePassword'
import EODReport from './components/EODReport'
import Celebration from './components/Celebration'
import { statusBucketForSite } from './utils/mapColors'
import { exportSitesCsv } from './utils/exportSitesCsv'
import { centralDateStr } from './utils/centralTime'
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
  fetchEODSummary,
  checkAccessIssue,
} from './utils/api'
import {
  saveSites,
  getSites,
  updateSiteLocally,
  queueUpdate,
  getPendingUpdates,
  deletePendingUpdate,
  getMeta,
  setMeta,
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
  // Easter egg: number of sites in the EOD just submitted, when it was more than 4.
  const [celebrateCount, setCelebrateCount] = useState(0)
  const [projectId, setProjectId] = useState(null)
  // Sites recollected today (marked Collected after being Partial/MOB Fee) —
  // { id, reason: 'partial' | 'mob' } pairs, persisted separately from `sites`
  // in the meta store, not on the site record itself, because a sites resync
  // (sync()/flushPending() below) fully replaces `sites` from the server and
  // would silently drop a flag stored there before the pilot gets to submit
  // their EOD. `reason` is which one it was, so EODReport can link it into the
  // matching EOD field (Partial Collection vs Mobilization) instead of lumping
  // every recollect into Reflys. See handleUpdate below and SiteDetail.jsx's
  // pendingRecollectReason for where this originates.
  const [recollectedSites, setRecollectedSites] = useState([])

  // Access-form handoffs in progress — { siteId, action, reason, since } for each
  // Partial / MOB Fee / Collected(recollect, refly) tap that opened the access
  // form but hasn't been confirmed yet. Persisted in IndexedDB ('pendingAccessForms'
  // meta) so it survives the phone suspending or reloading the app while the pilot
  // is in the Airtable form — before this lived only in SiteDetail's component
  // state, and a reload meant the site never got marked even though the form
  // was filed (see the 617430475 recollect, 11/16).
  const [waitingForms, setWaitingForms] = useState([])
  const [appToast, setAppToast] = useState('')
  const checkingFormsRef = useRef(null)
  const checkFormsRef = useRef(() => {})

  // Preflight state
  const [preflightChecked, setPreflightChecked] = useState(false)
  const [preflightExists, setPreflightExists] = useState(false)
  const [preflightTravelDay, setPreflightTravelDay] = useState(false)
  const [preflightId, setPreflightId] = useState(null)
  const [preflightRechecking, setPreflightRechecking] = useState(false)
  // Whether an EOD report is already on file for today — gates RouteView's
  // "Tomorrow" planning tab (Joe: next-day routing should only be offered
  // once today's flying is actually wrapped up). Re-checked on mount/login
  // like preflight, and flipped true immediately on a successful in-app EOD
  // submit so the tab unlocks without waiting on a resync.
  const [eodSubmittedToday, setEodSubmittedToday] = useState(false)

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
      checkAndSetEODStatus()
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
    const forms = await getMeta('pendingAccessForms')
    if (Array.isArray(forms)) {
      const today = centralDateStr()
      setWaitingForms(forms.filter(f => centralDateStr(new Date(f.since)) === today))
    }
    const recollected = await getMeta('recollectedToday')
    if (Array.isArray(recollected)) {
      const today = centralDateStr()
      setRecollectedSites(
        recollected
          .filter(e => centralDateStr(new Date(e.timestamp)) === today)
          .map(e => ({ id: e.id, reason: e.reason }))
      )
    }
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

  // Checks Airtable for today's EOD report — see eodSubmittedToday above.
  async function checkAndSetEODStatus() {
    try {
      const data = await fetchEODSummary()
      setEodSubmittedToday(!!data.submitted)
    } catch {
      // Non-fatal — worst case the Tomorrow tab stays locked until the next
      // successful check (e.g. on the next sync or login).
    }
  }

  // A site recollected today (Partial/MOB Fee -> Collected, tracked in the
  // 'recollectedToday' meta store — see handleUpdate below) can fall out of
  // the Airtable view(s) this app pulls from (fetchAllSiteRecords) the moment
  // its status flips to something the office's KML view doesn't carry
  // "done" sites for. That's expected/fine on the Airtable side — but it
  // means a plain fresh fetch silently drops the site from `sites` on the
  // pilot's very next resync (app reopen, flushPending, etc.), before
  // they've had a chance to submit today's EOD, which is what actually
  // records it for pay. Since IndexedDB's 'sites' store is put()-only (see
  // saveSites in db.js — it never deletes), the pilot's own last-known copy
  // of the site (already carrying collectedApp: true from the optimistic
  // update in handleUpdate) is still sitting in the cache even after it
  // disappears from a fresh fetch. This stitches that cached copy back into
  // the fresh list for as long as recollectedToday still flags it —
  // handleEODSubmit clears that flag on submit, so this stops covering for
  // it (and the site is free to actually drop off) right after the EOD that
  // needed it goes in.
  async function mergeRecollectedSites(freshSites) {
    const recollected = (await getMeta('recollectedToday')) || []
    if (recollected.length === 0) return freshSites

    const today = centralDateStr()
    const stillPendingIds = recollected
      .filter(e => centralDateStr(new Date(e.timestamp)) === today)
      .map(e => e.id)

    const freshIds = new Set(freshSites.map(s => s.id))
    const missingIds = stillPendingIds.filter(id => !freshIds.has(id))
    if (missingIds.length === 0) return freshSites

    const cached = await getSites()
    const cachedById = new Map(cached.map(s => [s.id, s]))
    const restored = missingIds.map(id => cachedById.get(id)).filter(Boolean)
    return restored.length > 0 ? [...freshSites, ...restored] : freshSites
  }

  // A fresh fetch from Airtable replaces every site with the server's copy. If a
  // change hasn't reached the server yet (queued offline / failed save), that
  // would silently revert it on screen and in the cache — which is how a
  // recollect could vanish before the EOD. This puts local changes that are
  // still waiting to be saved back on top of the fresh copy, and re-queues any
  // site recollected today whose Collected status the server doesn't have
  // (self-heal) so Airtable catches up the next time a flush runs.
  async function overlayLocalChanges(freshSites) {
    const byId = new Map(freshSites.map(s => [s.id, { ...s }]))
    const stamp = new Date().toISOString()
    const pending = await getPendingUpdates()
    const statusFor = a => ({
      collectedApp: a === 'collected',
      partialCollection: a === 'partial',
      mobFee: a === 'mob',
    })
    const queuedCollected = new Set()
    for (const { value } of pending) {
      const site = byId.get(value.recordId)
      if (!site) continue
      if (value.action) {
        Object.assign(site, statusFor(value.action), { appStatusUpdatedAt: new Date(value.queuedAt || Date.now()).toISOString() })
        if (value.action === 'collected') queuedCollected.add(value.recordId)
      }
      if (value.notes !== undefined) site.notes = value.notes
      if (value.pinIcon !== undefined) site.pinIcon = value.pinIcon
    }
    const recollected = (await getMeta('recollectedToday')) || []
    const today = centralDateStr()
    for (const e of recollected) {
      if (centralDateStr(new Date(e.timestamp)) !== today) continue
      const site = byId.get(e.id)
      if (!site || site.collectedApp || queuedCollected.has(e.id)) continue
      // Server doesn't show it Collected and nothing is queued to fix that.
      Object.assign(site, statusFor('collected'), { appStatusUpdatedAt: e.timestamp })
      await queueUpdate({ recordId: e.id, action: 'collected' })
    }
    const remaining = await getPendingUpdates()
    setPendingCount(remaining.length)
    return [...byId.values()]
  }

  async function sync() {
    if (syncing) return
    setSyncing(true)
    setSyncError('')
    try {
      const data = await fetchSites()
      const merged = await overlayLocalChanges(await mergeRecollectedSites(data.sites))
      await saveSites(merged)
      setSites(merged)
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
        const merged = await overlayLocalChanges(await mergeRecollectedSites(data.sites))
        await saveSites(merged)
        setSites(merged)
      }
    }
  }

  const handleUpdate = useCallback(async (recordId, action, meta) => {
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

    // Recollect tracking for the EOD's automatic re-link (see EODReport.jsx) —
    // meta.recollected comes from SiteDetail.jsx marking a site Collected that
    // was previously Partial or MOB Fee; meta.recollectReason ('partial' |
    // 'mob') says which one, so it can be linked into the matching EOD field.
    if (meta?.recollected) {
      const existing = (await getMeta('recollectedToday')) || []
      const next = [
        ...existing.filter(e => e.id !== recordId),
        { id: recordId, timestamp: new Date().toISOString(), reason: meta.recollectReason },
      ]
      await setMeta('recollectedToday', next)
      setRecollectedSites(next.map(e => ({ id: e.id, reason: e.reason })))
    }

    // Marking the site anything other than Collected (Partial, MOB Fee, cleared)
    // ends any recollect tracking for it.
    if (action !== 'collected' && !meta?.recollected) {
      const existing = (await getMeta('recollectedToday')) || []
      if (existing.some(e => e.id === recordId)) {
        const next = existing.filter(e => e.id !== recordId)
        await setMeta('recollectedToday', next)
        setRecollectedSites(next.map(e => ({ id: e.id, reason: e.reason })))
      }
    }

    // Returns { saved: true } once Airtable has it, { saved: false } when it's
    // only queued locally — callers use this so they never say "confirmed"
    // for something that hasn't actually been saved yet.
    if (isOnline) {
      try {
        await updateSite(recordId, action)
        return { saved: true }
      } catch (err) {
        // If network fails, queue it
        await queueUpdate({ recordId, action })
        setPendingCount(n => n + 1)
        return { saved: false }
      }
    } else {
      await queueUpdate({ recordId, action })
      setPendingCount(n => n + 1)
      return { saved: false }
    }
  }, [isOnline, selectedSite])

  // ---- Access-form handoff (persisted) ----------------------------------
  const persistForms = useCallback(async list => {
    setWaitingForms(list)
    await setMeta('pendingAccessForms', list)
  }, [])

  const startAccessForm = useCallback(async (siteId, action, reason, since) => {
    const existing = (await getMeta('pendingAccessForms')) || []
    await persistForms([...existing.filter(f => f.siteId !== siteId), { siteId, action, reason, since }])
  }, [persistForms])

  const cancelAccessForm = useCallback(async siteId => {
    const existing = (await getMeta('pendingAccessForms')) || []
    await persistForms(existing.filter(f => f.siteId !== siteId))
  }, [persistForms])

  function showAppToast(msg) {
    setAppToast(msg)
    setTimeout(() => setAppToast(''), 4000)
  }

  // Looks for a filed access form for every waiting site and, when found,
  // completes the status change the pilot started. Runs on app open, whenever
  // the app comes back to the foreground, and every few seconds while visible.
  function checkWaitingForms() {
    // Share one in-flight check so a manual "Check now" waits for the same run.
    if (checkingFormsRef.current) return checkingFormsRef.current
    if (!navigator.onLine) return Promise.resolve()
    const p = runWaitingFormsCheck().finally(() => { checkingFormsRef.current = null })
    checkingFormsRef.current = p
    return p
  }

  async function runWaitingFormsCheck() {
    const list = ((await getMeta('pendingAccessForms')) || [])
    if (list.length === 0) return
    {
      const today = centralDateStr()
      let current = list.filter(f => centralDateStr(new Date(f.since)) === today)
      for (const f of list) {
        if (!current.includes(f)) continue
        try {
          const result = await checkAccessIssue(f.siteId, f.since)
          if (!result.exists) continue
          const out = await handleUpdate(
            f.siteId,
            f.action,
            f.reason ? { recollected: true, recollectReason: f.reason } : undefined
          )
          current = current.filter(x => x.siteId !== f.siteId)
          await persistForms(current)
          const label = f.action === 'partial' ? 'Partial' : f.action === 'mob' ? 'MOB Fee' : 'Collected'
          showAppToast(out?.saved ? `✓ ${label} confirmed` : `${label} recorded — will sync when online`)
        } catch (err) {
          if (err.message === 'AUTH_EXPIRED') { handleLogout(); return }
          // otherwise leave it waiting and try again next time
        }
      }
      if (current.length !== list.length) await persistForms(current)
    }
  }
  checkFormsRef.current = checkWaitingForms

  // Re-check when the app returns to the foreground / regains focus / comes back
  // from the back-forward cache (iOS PWAs don't reliably fire visibilitychange),
  // once on open/login, and on a short poll while forms are waiting.
  useEffect(() => {
    if (!pilot) return
    const run = () => { if (document.visibilityState === 'visible') checkFormsRef.current() }
    document.addEventListener('visibilitychange', run)
    window.addEventListener('focus', run)
    window.addEventListener('pageshow', run)
    window.addEventListener('online', run)
    run()
    return () => {
      document.removeEventListener('visibilitychange', run)
      window.removeEventListener('focus', run)
      window.removeEventListener('pageshow', run)
      window.removeEventListener('online', run)
    }
  }, [pilot])

  useEffect(() => {
    if (!pilot || waitingForms.length === 0) return
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') checkFormsRef.current()
    }, 6000)
    return () => clearInterval(id)
  }, [pilot, waitingForms.length])

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
  const handleNotesSave = useCallback(async (recordId, rawNotes) => {
    // Append "- FirstName" so every note shows who wrote it. The server does the
    // same (api/_notes.js) and won't double it, so offline-queued notes stay consistent.
    const first = String(pilot?.firstName || pilot?.displayName || '').trim().split(/\s+/)[0]
    let notes = rawNotes
    if (first && rawNotes && rawNotes.trim()) {
      const sig = `- ${first}`
      notes = rawNotes.trim().toLowerCase().endsWith(sig.toLowerCase()) ? rawNotes.trim() : `${rawNotes.trim()} ${sig}`
    }
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
  }, [isOnline, pilot])

  // Photos added/removed on a site's notes — already saved to Airtable by the
  // upload call; this just keeps the on-screen and cached copy current.
  const handleAttachmentsChange = useCallback(async (recordId, noteAttachments) => {
    await updateSiteLocally(recordId, { noteAttachments })
    setSites(prev => prev.map(s => s.id === recordId ? { ...s, noteAttachments } : s))
    setSelectedSite(prev => prev?.id === recordId ? { ...prev, noteAttachments } : prev)
  }, [])

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
    // Easter egg — every site visited today counts (full + partial + MOB Fee),
    // each site once even if it appears in more than one list (e.g. a recollect).
    const visitedToday = new Set([
      ...(payload.collectedIds || []),
      ...(payload.partialIds || []),
      ...(payload.mobIds || []),
    ]).size
    if (visitedToday > 4) setCelebrateCount(visitedToday)
    // Unlocks RouteView's "Tomorrow" tab immediately — no need to wait on a
    // resync or app reopen to re-check Airtable.
    setEodSubmittedToday(true)
    // Recollected sites have now been linked in the submitted EOD (see
    // EODReport.jsx) — clear the tracking so they don't get re-linked into a
    // second EOD later today.
    await setMeta('recollectedToday', [])
    setRecollectedSites([])
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
    setRecollectedSites([])
    setEodSubmittedToday(false)
  }

  function handleLogin(data, password) {
    const info = getPilotInfo()
    setPilot(info || data)
    if (password) setPendingPassword(password)
    checkAndSetPreflight()
    checkAndSetEODStatus()
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
        recollected={recollectedSites}
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
          <button
            className="icon-btn csv-export-btn"
            onClick={() => exportSitesCsv(sites, pilot.firstName || pilot.displayName)}
            disabled={sites.length === 0}
            title="Export all my sites to CSV"
          >
            CSV
          </button>
          {!isOnline && <span className="offline-pill">Offline</span>}
          {pendingCount > 0 && <span className="pending-pill">{pendingCount} pending</span>}
        </div>
        <img className="top-bar-logo" src="/alamo-logo.png" alt="Alamo Airborne" />
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
        {view === 'route' && (preflightExists ? <RouteView sites={sites} eodSubmittedToday={eodSubmittedToday} /> : <MapView sites={sites} onSelect={handleSelectSite} highlightedSiteId={highlightedSiteId} />)}
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

      {/* Access forms still waiting to be confirmed — visible from any tab */}
      {waitingForms.length > 0 && (
        <div className="forms-waiting-banner">
          <span>
            📋 {waitingForms.length} site{waitingForms.length > 1 ? 's' : ''} waiting for the access form
            {waitingForms.length > 1 ? 's' : ''} to be confirmed
          </span>
          <button onClick={() => checkFormsRef.current()}>Check now</button>
        </div>
      )}
      {appToast && <div className="forms-waiting-toast">{appToast}</div>}

      {/* Site detail sheet */}
      {selectedSite && (
        <SiteDetail
          site={selectedSite}
          onClose={() => setSelectedSite(null)}
          onUpdate={handleUpdate}
          waitingForm={waitingForms.find(f => f.siteId === selectedSite.id) || null}
          onStartAccessForm={startAccessForm}
          onCancelAccessForm={cancelAccessForm}
          onCheckForms={() => checkFormsRef.current()}
          isOnline={isOnline}
          pendingCount={pendingCount}
          canEdit={canEdit}
          onPinIconChange={handlePinIconChange}
          onNotesSave={handleNotesSave}
          onAttachmentsChange={handleAttachmentsChange}
        />
      )}

      {/* Easter egg — plays after an EOD covering more than 4 sites */}
      {celebrateCount > 0 && (
        <Celebration siteCount={celebrateCount} onClose={() => setCelebrateCount(0)} />
      )}

    </div>
  )
}

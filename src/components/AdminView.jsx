import { useEffect, useRef, useState, useCallback } from 'react'
import { fetchAdminData, updateSiteNotes } from '../utils/api'
import { colorForSite, isSiteDone, statusBucketForSite } from '../utils/mapColors'
import { isMarkedToday, formatCentralTime } from '../utils/centralTime'
import { createRadarLayer, fetchLatestRadarTime } from '../utils/radarLayer'
import { tileLayerFor } from '../utils/mapLayers'
import { quadcopterIcon, makeSiteIcon } from '../utils/mapIcons'
import { sortSites, SORT_OPTIONS } from '../utils/sortSites'
import { formatDateOnly } from '../utils/formatDate'
import AdminSiteDetail from './AdminSiteDetail'

const PILOT_COLORS = ['#3b82f6', '#a855f7', '#14b8a6', '#f59e0b', '#ec4899', '#84cc16', '#06b6d4', '#f43f5e']

function colorForPilot(pilotId) {
  let hash = 0
  for (let i = 0; i < pilotId.length; i++) hash = (hash * 31 + pilotId.charCodeAt(i)) >>> 0
  return PILOT_COLORS[hash % PILOT_COLORS.length]
}

function timeAgo(iso) {
  if (!iso) return null
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  return `${hrs}h ago`
}

// Same check used in SiteList.jsx / MapView.jsx / SiteDetail.jsx.
function isReflySite(site) {
  return !!site.refly || site.mapColor === 'Refly' || site.mapColor === 'Refly Further Coordination Required'
}

// Same bucketing used for the pilot List view's filter tabs — keeps the Admin
// List's filter tabs and counts consistent with the pilot's own List view.
function getSiteStatus(site) {
  return statusBucketForSite(site) || 'none'
}

// Same fields/logic as SiteList.jsx's matchesSearch — kept as a local copy
// rather than a shared import since neither file currently imports from the
// other (matches how isReflySite is duplicated across these files too).
function matchesSearch(site, query) {
  const haystack = [site.siteId, site.fuzeId, site.city, site.state, site.subProject, site.address]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return haystack.includes(query)
}

// Site marker — same shape-per-icon-type as the pilot's own map (utils/mapIcons.js),
// since the "App Pin Icon" field a pilot sets in SiteDetail is now synced, not local.
function siteIcon(color, pinIcon) {
  return makeSiteIcon(color, pinIcon, 18)
}

// Live pilot location marker — same black quadcopter shape as the pilot's own
// "You are here" marker in MapView.jsx. Pilots are told apart by the tooltip
// (name) and the color-coded chip strip below, not the icon color.
function pilotIcon() {
  return quadcopterIcon(30)
}

export default function AdminView() {
  const mapRef = useRef(null)
  const wrapperRef = useRef(null)
  const mapInstance = useRef(null)
  const tileLayerRef = useRef(null)
  // Site markers live in this cluster group (like the pilot Map tab) so admins
  // can turn grouping on/off for map speed; falls back to a plain layerGroup
  // if the CDN clustering plugin didn't load. Pilot GPS markers below are
  // intentionally left out of this group — there are only ever a handful of
  // pilots and admins need to always see each one individually.
  const clusterGroupRef = useRef(null)
  const siteMarkersRef = useRef([])
  const pilotMarkersRef = useRef([])
  const clusterInitRef = useRef(false) // skips the swap effect on first mount
  const hasFitRef = useRef(false) // fit-to-bounds happens once per view-open, not on every 60s refresh
  const pilotStripRef = useRef(null) // the scrollable pilot chip strip itself
  const pilotScrollbarRef = useRef(null) // the custom slider track rendered below it

  const [sites, setSites] = useState([])
  const [pilots, setPilots] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [asOf, setAsOf] = useState(null)
  const [hiddenPilotIds, setHiddenPilotIds] = useState(() => new Set())
  const [markedTodayOnly, setMarkedTodayOnly] = useState(false)
  const [satellite, setSatellite] = useState(false)
  const [clustered, setClustered] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  // Radar overlay — same on-demand, pilot/admin-toggled, never-auto-refreshing
  // behavior as the pilot Map tab (see MapView.jsx's identical block): a
  // stale frame nobody asked to refresh is worse than no radar for a go/no-go
  // read, so the "as of HH:MM" chip is load-bearing, not decorative.
  const [radarOn, setRadarOn] = useState(false)
  const [radarStatus, setRadarStatus] = useState('idle') // idle | loading | ready | error
  const [radarTime, setRadarTime] = useState(null)
  const radarLayerRef = useRef(null)
  const [mode, setMode] = useState('map') // 'map' | 'list'
  const [selectedPilotId, setSelectedPilotId] = useState(null)
  const [selectedSite, setSelectedSite] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortKey, setSortKey] = useState('siteId')
  const [listSearch, setListSearch] = useState('')
  // Drives the custom pilot-strip slider below — native scrollbars on the strip
  // are hidden (see .filter-tabs CSS), so a desktop mouse user has no visible
  // way to grab-scroll it otherwise; this tracks scrollLeft/scrollWidth/clientWidth
  // so the slider thumb can mirror the strip's real scroll position/size.
  const [pilotStripMetrics, setPilotStripMetrics] = useState({ scrollLeft: 0, scrollWidth: 0, clientWidth: 0 })

  // Applied before the pilot chip strip's own show/hide — "Marked Today" narrows
  // the pool down to sites a pilot touched today, and everything downstream
  // (map pins, list rows, chip strip membership + done/total counts) reads from
  // this instead of the raw `sites` list.
  const visibleSites = markedTodayOnly ? sites.filter(isMarkedToday) : sites

  const load = useCallback(async () => {
    setError('')
    try {
      const data = await fetchAdminData()
      setSites(data.sites || [])
      setPilots(data.pilots || [])
      setAsOf(new Date().toISOString())
    } catch (err) {
      setError(err.message === 'FORBIDDEN' ? 'Admin access required' : 'Failed to load admin data')
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial load + auto-refresh every 60s while this view is open
  useEffect(() => {
    load()
    const interval = setInterval(load, 60000)
    return () => clearInterval(interval)
  }, [load])

  // Keeps the custom pilot-strip slider in sync with the strip's actual scroll
  // position/size. Re-measures on scroll, on element resize (e.g. window resize
  // changing available width), and whenever the pilot/site data changes (new
  // chips can change scrollWidth without the strip's own box size changing, which
  // ResizeObserver alone wouldn't catch).
  useEffect(() => {
    const strip = pilotStripRef.current
    if (!strip) return

    const measure = () => {
      setPilotStripMetrics({
        scrollLeft: strip.scrollLeft,
        scrollWidth: strip.scrollWidth,
        clientWidth: strip.clientWidth,
      })
    }

    measure()
    strip.addEventListener('scroll', measure, { passive: true })

    const ro = new ResizeObserver(measure)
    ro.observe(strip)

    return () => {
      strip.removeEventListener('scroll', measure)
      ro.disconnect()
    }
  }, [pilots, visibleSites])

  // Initialize map once
  useEffect(() => {
    if (mapInstance.current) return
    const L = window.L
    if (!L) return
    const map = L.map(mapRef.current, {
      center: [32.7767, -96.7970],
      zoom: 7,
      zoomControl: true,
      // MarkerClusterGroup.onAdd() reads map.getMaxZoom() immediately and
      // throws if nothing's supplied one yet — same fix as the pilot Map tab.
      maxZoom: 19,
    })
    mapInstance.current = map

    const clusterGroup = clustered && L.markerClusterGroup
      ? L.markerClusterGroup({ chunkedLoading: true })
      : L.layerGroup()
    clusterGroup.addTo(map)
    clusterGroupRef.current = clusterGroup

    return () => {
      map.remove()
      mapInstance.current = null
      clusterGroupRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Swaps the site-marker group between clustered and unclustered whenever the
  // toggle changes — moves existing markers to a fresh group instead of
  // rebuilding them. Skipped on mount since the init effect above already
  // creates the correctly-typed group.
  useEffect(() => {
    if (!clusterInitRef.current) {
      clusterInitRef.current = true
      return
    }
    const L = window.L
    const map = mapInstance.current
    if (!map || !L) return

    const oldGroup = clusterGroupRef.current
    if (oldGroup) map.removeLayer(oldGroup)

    const newGroup = clustered && L.markerClusterGroup
      ? L.markerClusterGroup({ chunkedLoading: true })
      : L.layerGroup()

    if (siteMarkersRef.current.length > 0) {
      if (typeof newGroup.addLayers === 'function') newGroup.addLayers(siteMarkersRef.current)
      else siteMarkersRef.current.forEach(m => newGroup.addLayer(m))
    }

    newGroup.addTo(map)
    clusterGroupRef.current = newGroup
  }, [clustered])

  // Mirrors the pilot Map tab's fullscreen implementation — see the longer
  // comment there. Short version: iOS Safari has no Fullscreen API for
  // anything but <video>, so `isFullscreen` is our own state driven by the
  // .map-wrapper-fullscreen CSS class, and the native API (where supported)
  // is only called opportunistically as a chrome-hiding bonus.
  const nativeFsSupportedRef = useRef(
    typeof document !== 'undefined' && !!(document.fullscreenEnabled || document.webkitFullscreenEnabled)
  )

  useEffect(() => {
    function handleFullscreenChange() {
      const active = document.fullscreenElement === wrapperRef.current
        || document.webkitFullscreenElement === wrapperRef.current
      if (!active) setIsFullscreen(false)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => mapInstance.current?.invalidateSize(), 100)
    const prevOverflow = document.body.style.overflow
    if (isFullscreen) document.body.style.overflow = 'hidden'
    return () => {
      clearTimeout(t)
      document.body.style.overflow = prevOverflow
    }
  }, [isFullscreen])

  function toggleFullscreen() {
    const next = !isFullscreen
    setIsFullscreen(next)

    if (!nativeFsSupportedRef.current) return
    if (next) {
      const el = wrapperRef.current
      const req = el?.requestFullscreen || el?.webkitRequestFullscreen
      req?.call(el)?.catch?.(() => {})
    } else {
      const active = document.fullscreenElement || document.webkitFullscreenElement
      if (active) (document.exitFullscreen || document.webkitExitFullscreen)?.call(document)
    }
  }

  // Swap the tile layer whenever the street/satellite toggle changes (also
  // runs once on mount to add the initial street layer).
  useEffect(() => {
    const L = window.L
    const map = mapInstance.current
    if (!map || !L) return
    if (tileLayerRef.current) map.removeLayer(tileLayerRef.current)
    const tile = tileLayerFor(satellite)
    tileLayerRef.current = L.tileLayer(tile.url, tile.options).addTo(map)
  }, [satellite])

  // Fetches the latest available radar scan time from NOAA and (re)points
  // the radar layer at it — same function shape as MapView.jsx's version,
  // just against AdminView's own map instance. Never called on a timer.
  async function refreshRadar() {
    const map = mapInstance.current
    if (!map) return
    setRadarStatus('loading')
    try {
      const timeMs = await fetchLatestRadarTime()
      const time = new Date(timeMs)
      if (radarLayerRef.current) {
        radarLayerRef.current.setTimeRange(time, time)
      } else {
        radarLayerRef.current = createRadarLayer(time)
        radarLayerRef.current?.addTo(map)
      }
      setRadarTime(time)
      setRadarStatus('ready')
    } catch (err) {
      setRadarStatus('error')
    }
  }

  // Add/remove the radar layer when the toggle flips — same behavior as the
  // pilot Map tab's identical effect: turning on always triggers one fetch,
  // turning off tears the layer down entirely rather than just hiding it.
  useEffect(() => {
    const map = mapInstance.current
    if (!map) return

    if (radarOn) {
      refreshRadar()
    } else if (radarLayerRef.current) {
      map.removeLayer(radarLayerRef.current)
      radarLayerRef.current = null
      setRadarStatus('idle')
      setRadarTime(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radarOn])

  // Redraw site markers
  useEffect(() => {
    const L = window.L
    const map = mapInstance.current
    const clusterGroup = clusterGroupRef.current
    if (!map || !L || !clusterGroup) return

    if (typeof clusterGroup.clearLayers === 'function') clusterGroup.clearLayers()
    else siteMarkersRef.current.forEach(m => clusterGroup.removeLayer(m))
    siteMarkersRef.current = []

    const mapped = visibleSites.filter(s => {
      if (!s.lat || !s.lng) return false
      const assigned = s.pilotApp || []
      // Unassigned sites always show; assigned sites show if at least one of
      // their pilots hasn't been toggled off in the chip strip.
      return assigned.length === 0 || assigned.some(id => !hiddenPilotIds.has(id))
    })
    const toAdd = []
    mapped.forEach(site => {
      // Unassigned sites (no pilot in PILOT_APP) render as a solid black
      // square regardless of status color or a leftover pin icon choice, so
      // they jump out on the admin map as "needs a pilot assigned" — see
      // mapIcons.js siteIconSvg's 'unassigned' case.
      const unassigned = (site.pilotApp || []).length === 0
      const color = unassigned ? '#000000' : colorForSite(site)
      const iconType = unassigned ? 'unassigned' : site.pinIcon
      const marker = L.marker([site.lat, site.lng], { icon: siteIcon(color, iconType) })
      const pilotNames = (site.pilotNames || []).join(', ') || 'Unassigned'
      const reflyLine = isReflySite(site) && site.reflyNotes
        ? `<br><em>Refly: ${site.reflyNotes}</em>`
        : ''
      const forecastLine = (site.forecastDate || site.prePost)
        ? `<br>${[site.prePost, site.forecastDate ? formatDateOnly(site.forecastDate) : ''].filter(Boolean).join(' — ')}`
        : ''
      marker.bindTooltip(
        `<strong>${site.siteId || 'Site'}</strong><br>Pilot: ${pilotNames}<br>${site.mapColor || ''}<br>${site.city || ''} ${site.state || ''}${forecastLine}${reflyLine}`,
        { direction: 'top', offset: [0, -8] }
      )
      marker.on('click', () => setSelectedSite(site))
      toAdd.push(marker)
      siteMarkersRef.current.push(marker)
    })

    if (typeof clusterGroup.addLayers === 'function') clusterGroup.addLayers(toAdd)
    else toAdd.forEach(m => clusterGroup.addLayer(m))
  }, [visibleSites, hiddenPilotIds])

  // Redraw pilot markers
  useEffect(() => {
    const L = window.L
    const map = mapInstance.current
    if (!map || !L) return

    pilotMarkersRef.current.forEach(m => m.remove())
    pilotMarkersRef.current = []

    const located = pilots.filter(p => p.lat && p.lng && !hiddenPilotIds.has(p.pilotId))
    located.forEach(p => {
      const marker = L.marker([p.lat, p.lng], { icon: pilotIcon(), zIndexOffset: 500 })
      const ago = timeAgo(p.updatedAt) || 'unknown'
      marker.bindTooltip(
        `<strong>${p.name}</strong>${p.travelDay ? ' (travel day)' : ''}<br>Updated ${ago}`,
        { direction: 'top', offset: [0, -14] }
      )
      marker.addTo(map)
      pilotMarkersRef.current.push(marker)
    })
  }, [pilots, hiddenPilotIds])

  // Fit bounds to everything we have — only once, the first time data loads
  // after this view opens. The 60s auto-refresh below used to re-fit on every
  // single pass (it depended on `asOf`, which changes every refresh), which
  // yanked the map back to the full view and wiped out any pan/zoom the admin
  // had mid-review. `hasFitRef` makes this a one-shot instead; use the
  // "Recenter" button for anything after that.
  useEffect(() => {
    const L = window.L
    const map = mapInstance.current
    if (!map || !L || !asOf || hasFitRef.current) return
    const allPts = [
      ...sites.filter(s => s.lat && s.lng).map(s => [s.lat, s.lng]),
      ...pilots.filter(p => p.lat && p.lng).map(p => [p.lat, p.lng]),
    ]
    if (allPts.length > 0) {
      map.fitBounds(L.latLngBounds(allPts), { padding: [30, 30], maxZoom: 12 })
      hasFitRef.current = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asOf])

  // Manual escape hatch for the one-shot fit above — recenters/refits to
  // whatever's currently visible (respecting the pilot chip strip + Marked
  // Today filter), since auto-refresh no longer does this automatically.
  function recenterMap() {
    const L = window.L
    const map = mapInstance.current
    if (!map || !L) return
    const allPts = [
      ...visibleSites.filter(s => s.lat && s.lng).map(s => [s.lat, s.lng]),
      ...pilots.filter(p => p.lat && p.lng && !hiddenPilotIds.has(p.pilotId)).map(p => [p.lat, p.lng]),
    ]
    if (allPts.length > 0) {
      map.fitBounds(L.latLngBounds(allPts), { padding: [30, 30], maxZoom: 12 })
    }
  }

  // Notes edit from the Admin detail sheet — same field/save path as the pilot
  // app's NotesEditor (api/update-site.js Notes shape), just written straight
  // through since the Admin view isn't offline-first like the pilot app.
  async function handleNotesSave(recordId, notes) {
    setSites(prev => prev.map(s => s.id === recordId ? { ...s, notes } : s))
    setSelectedSite(prev => prev?.id === recordId ? { ...prev, notes } : prev)
    await updateSiteNotes(recordId, notes)
  }

  function togglePilot(pilotId) {
    setHiddenPilotIds(prev => {
      const next = new Set(prev)
      if (next.has(pilotId)) next.delete(pilotId)
      else next.add(pilotId)
      return next
    })
  }

  // Drag-to-scroll thumb for the pilot chip strip's custom slider track. Uses
  // Pointer Events so it works for mouse, pen, or touch alike, though touch
  // users can already swipe the strip directly the way they would on mobile.
  function handlePilotStripThumbPointerDown(e) {
    e.preventDefault()
    e.stopPropagation()
    const strip = pilotStripRef.current
    const track = pilotScrollbarRef.current
    if (!strip || !track) return

    const trackWidth = track.getBoundingClientRect().width
    const maxScroll = strip.scrollWidth - strip.clientWidth
    const startX = e.clientX
    const startScrollLeft = strip.scrollLeft

    function onMove(ev) {
      const dx = ev.clientX - startX
      const deltaScroll = (dx / trackWidth) * strip.scrollWidth
      strip.scrollLeft = Math.min(maxScroll, Math.max(0, startScrollLeft + deltaScroll))
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // Click anywhere on the track itself (not the thumb) to jump straight there.
  function handlePilotStripTrackClick(e) {
    if (e.target !== e.currentTarget) return
    const strip = pilotStripRef.current
    const track = pilotScrollbarRef.current
    if (!strip || !track) return

    const rect = track.getBoundingClientRect()
    const maxScroll = strip.scrollWidth - strip.clientWidth
    const clickFraction = (e.clientX - rect.left) / rect.width
    strip.scrollLeft = Math.min(maxScroll, Math.max(0, clickFraction * strip.scrollWidth - strip.clientWidth / 2))
  }

  function sitesForPilot(pilotId) {
    return visibleSites.filter(s => (s.pilotApp || []).includes(pilotId))
  }

  // Bulk show/hide every pilot in the chip strip (same pilot set the strip itself
  // renders — anyone with at least one assigned site, within the current
  // Marked Today filter if it's on).
  function selectAllPilots() {
    setHiddenPilotIds(new Set())
  }

  function deselectAllPilots() {
    const allIds = pilots.filter(p => sitesForPilot(p.pilotId).length > 0).map(p => p.pilotId)
    setHiddenPilotIds(new Set(allIds))
  }

  // Double-click a chip: select that pilot (filters the site list) and fit the map
  // to their assigned sites plus their own GPS location, so the pilot pin is always
  // in view alongside their sites.
  function selectPilot(pilotId) {
    const willSelect = selectedPilotId !== pilotId
    setSelectedPilotId(willSelect ? pilotId : null)
    if (!willSelect) return

    const L = window.L
    const map = mapInstance.current
    if (!map || !L) return
    const theirSites = sitesForPilot(pilotId).filter(s => s.lat && s.lng)
    const p = pilots.find(x => x.pilotId === pilotId)
    const pts = theirSites.map(s => [s.lat, s.lng])
    if (p && p.lat && p.lng) pts.push([p.lat, p.lng])

    if (pts.length > 0) {
      map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 14 })
    }
  }

  // Base pool for the List view — pilot chip selection applied, before the
  // status filter/sort below. Counts on the filter tabs read from this so they
  // reflect the current pilot selection, same as the tabs' relationship to
  // `sites` in the pilot List view.
  const listSites = selectedPilotId ? sitesForPilot(selectedPilotId) : visibleSites
  const selectedPilotName = pilots.find(p => p.pilotId === selectedPilotId)?.name

  const listCounts = {
    all: listSites.length,
    none: listSites.filter(s => getSiteStatus(s) === 'none').length,
    collected: listSites.filter(s => getSiteStatus(s) === 'collected').length,
    partial: listSites.filter(s => getSiteStatus(s) === 'partial').length,
    mob: listSites.filter(s => getSiteStatus(s) === 'mob').length,
    // Reflys are a status-independent flag (mapColor Refly/Refly Further
    // Coordination Required, or the office REFLY checkbox) — a refly site
    // still buckets as 'none' (Pending) in getSiteStatus above, so this tab
    // filters on isReflySite directly rather than joining the status buckets.
    refly: listSites.filter(isReflySite).length,
  }

  const trimmedQuery = listSearch.trim().toLowerCase()
  const displaySites = sortSites(
    listSites.filter(s => {
      if (statusFilter === 'refly') {
        if (!isReflySite(s)) return false
      } else if (statusFilter !== 'all' && getSiteStatus(s) !== statusFilter) {
        return false
      }
      if (trimmedQuery && !matchesSearch(s, trimmedQuery)) return false
      return true
    }),
    sortKey
  )

  return (
    <div className="admin-view">
      <div className="admin-toolbar">
        <div className="admin-toolbar-title">
          Admin — All Pilots
          {asOf && <span className="admin-asof">Refreshed {timeAgo(asOf)}</span>}
          <button className="admin-chip-bulk-btn" onClick={selectAllPilots}>Select All</button>
          <button className="admin-chip-bulk-btn" onClick={deselectAllPilots}>Deselect All</button>
          <button
            className={`admin-chip-bulk-btn ${markedTodayOnly ? 'active' : ''}`}
            onClick={() => setMarkedTodayOnly(v => !v)}
            title="Show only sites a pilot marked today — pilot chips still filter within that"
          >
            Marked Today
          </button>
        </div>
        <div className="admin-toolbar-actions">
          <div className="view-toggle admin-mode-toggle">
            <button
              className={`toggle-btn ${mode === 'map' ? 'active' : ''}`}
              onClick={() => setMode('map')}
            >
              Map
            </button>
            <button
              className={`toggle-btn ${mode === 'list' ? 'active' : ''}`}
              onClick={() => setMode('list')}
            >
              List
            </button>
          </div>
          <button className="icon-btn" onClick={recenterMap} title="Recenter map to fit all visible pins">
            ⤢
          </button>
          <button className="icon-btn" onClick={load} disabled={loading} title="Refresh">
            {loading ? '⏳' : '⟳'}
          </button>
        </div>
      </div>

      {error && <div className="sync-error">{error}</div>}

      {/* Pilot chip strip — every pilot with at least one site in the "Verizon vHive
          All for KMLs" view, regardless of preflight status. Tap a chip to show/hide
          that pilot's pin + sites on the map; map pins default to everyone visible. */}
      <div className="filter-tabs admin-pilot-strip" ref={pilotStripRef}>
        {pilots.filter(p => sitesForPilot(p.pilotId).length > 0).map(p => {
          const s = sitesForPilot(p.pilotId)
          const done = s.filter(isSiteDone).length
          const isHidden = hiddenPilotIds.has(p.pilotId)
          return (
            <button
              key={p.pilotId}
              className={`filter-tab admin-pilot-chip ${isHidden ? 'admin-pilot-chip-off' : 'active'} ${selectedPilotId === p.pilotId ? 'admin-pilot-chip-selected' : ''}`}
              onClick={() => togglePilot(p.pilotId)}
              onDoubleClick={() => selectPilot(p.pilotId)}
              style={{ borderColor: colorForPilot(p.pilotId) }}
              title={`${isHidden ? 'Hidden' : 'Visible'} — tap to show/hide, double-tap to center on their sites`}
            >
              <span className="admin-pilot-dot" style={{ background: colorForPilot(p.pilotId) }} />
              {p.name} · {done}/{s.length}
              {!p.hasPreflightToday && <span className="admin-pilot-no-preflight"> (no Preflight)</span>}
            </button>
          )
        })}
      </div>

      {/* Custom horizontal slider for the pilot chip strip above — the strip's
          native scrollbar is hidden (see .filter-tabs CSS) so on desktop there was
          no visible/draggable way to scroll it, forcing arrow keys that sometimes
          land on the map instead. Only rendered once content actually overflows. */}
      {pilotStripMetrics.scrollWidth > pilotStripMetrics.clientWidth + 1 && (
        <div
          className="admin-pilot-scrollbar"
          ref={pilotScrollbarRef}
          onClick={handlePilotStripTrackClick}
        >
          <div
            className="admin-pilot-scrollbar-thumb"
            style={{
              width: `${Math.max(8, (pilotStripMetrics.clientWidth / pilotStripMetrics.scrollWidth) * 100)}%`,
              left: `${(pilotStripMetrics.scrollLeft / (pilotStripMetrics.scrollWidth - pilotStripMetrics.clientWidth)) * (100 - Math.max(8, (pilotStripMetrics.clientWidth / pilotStripMetrics.scrollWidth) * 100))}%`,
            }}
            onPointerDown={handlePilotStripThumbPointerDown}
          />
        </div>
      )}

      <div
        ref={wrapperRef}
        className={`map-wrapper admin-map-wrapper${isFullscreen ? ' map-wrapper-fullscreen' : ''}`}
        style={{ display: mode === 'map' ? 'block' : 'none' }}
      >
        <div ref={mapRef} className="map-container" />
        <button
          className="map-fullscreen-btn"
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit full screen' : 'View full screen'}
          aria-label={isFullscreen ? 'Exit full screen' : 'View full screen'}
        >
          {isFullscreen ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3v3a2 2 0 0 1-2 2H3" />
              <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
              <path d="M3 16h3a2 2 0 0 1 2 2v3" />
              <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3H5a2 2 0 0 0-2 2v3" />
              <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
              <path d="M3 16v3a2 2 0 0 0 2 2h3" />
              <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
            </svg>
          )}
        </button>
        <button
          className={`map-cluster-btn${clustered ? ' active' : ''}`}
          onClick={() => setClustered(v => !v)}
          title={clustered ? 'Turn off pin grouping' : 'Turn on pin grouping'}
          aria-label={clustered ? 'Turn off pin grouping' : 'Turn on pin grouping'}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="9" cy="9" r="4" />
            <circle cx="16" cy="9" r="4" />
            <circle cx="12.5" cy="15" r="4" />
          </svg>
        </button>
        <button
          className={`map-radar-btn${radarOn ? ' active' : ''}`}
          onClick={() => setRadarOn(v => !v)}
          title={radarOn ? 'Hide radar' : 'Show radar'}
          aria-label={radarOn ? 'Hide radar overlay' : 'Show radar overlay'}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="5" />
            <circle cx="12" cy="12" r="1" fill="currentColor" />
            <line x1="12" y1="12" x2="18" y2="7" />
          </svg>
        </button>
        <button
          className={`map-layer-btn${satellite ? ' active' : ''}`}
          onClick={() => setSatellite(v => !v)}
          title={satellite ? 'Switch to street map' : 'Switch to satellite view'}
          aria-label={satellite ? 'Switch to street map' : 'Switch to satellite view'}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 2 7 12 12 22 7 12 2" />
            <polyline points="2 17 12 22 22 17" />
            <polyline points="2 12 12 17 22 12" />
          </svg>
        </button>
        {radarOn && (
          <button
            type="button"
            className={`map-radar-legend${radarStatus === 'error' ? ' map-radar-legend-error' : ''}`}
            onClick={refreshRadar}
            disabled={radarStatus === 'loading'}
            title="Tap to refresh radar"
          >
            {radarStatus === 'loading' && 'Loading radar…'}
            {radarStatus === 'error' && 'Radar unavailable — tap to retry'}
            {radarStatus === 'ready' && radarTime && (
              <>Radar as of {formatCentralTime(radarTime)} <span className="map-radar-refresh-icon">⟳</span></>
            )}
          </button>
        )}
      </div>

      {mode === 'list' && (
        <div className="site-list-container admin-site-list">
          <div className="site-search-row">
            <input
              type="text"
              inputMode="search"
              className="site-search-input"
              placeholder="Search site ID, FUZE, city…"
              value={listSearch}
              onChange={e => setListSearch(e.target.value)}
            />
            {listSearch && (
              <button
                type="button"
                className="site-search-clear"
                onClick={() => setListSearch('')}
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>
          <div className="admin-list-header">
            {selectedPilotId ? (
              <>
                Showing <strong>{selectedPilotName || 'pilot'}</strong> · {displaySites.length} sites
                <button className="admin-list-clear" onClick={() => setSelectedPilotId(null)}>Show all</button>
              </>
            ) : (
              <>All pilots · {displaySites.length} sites</>
            )}
          </div>
          <div className="filter-tabs">
            {[
              { key: 'all', label: `All (${listCounts.all})` },
              { key: 'none', label: `Pending (${listCounts.none})` },
              { key: 'collected', label: `Done (${listCounts.collected})` },
              { key: 'partial', label: `Partial (${listCounts.partial})` },
              { key: 'mob', label: `MOB (${listCounts.mob})` },
              { key: 'refly', label: `Reflys (${listCounts.refly})` },
            ].map(f => (
              <button
                key={f.key}
                className={`filter-tab ${statusFilter === f.key ? 'active' : ''}`}
                onClick={() => setStatusFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
            <select
              className="sort-select"
              value={sortKey}
              onChange={e => setSortKey(e.target.value)}
              title="Sort sites"
              aria-label="Sort sites"
            >
              {SORT_OPTIONS.map(o => (
                <option key={o.key} value={o.key}>Sort: {o.label}</option>
              ))}
            </select>
          </div>
          <div className="site-list">
            {displaySites.length === 0 && (
              <div className="empty-state">{trimmedQuery ? 'No sites match your search' : 'No sites'}</div>
            )}
            {displaySites.map(site => {
              const color = colorForSite(site)
              const pilotNames = (site.pilotNames || []).join(', ') || 'Unassigned'
              return (
                <div key={site.id} className="site-row" onClick={() => setSelectedSite(site)}>
                  <div className="status-dot" style={{ background: color }} />
                  <div className="site-row-info">
                    <div className="site-row-id">{site.siteId || '—'}</div>
                    <div className="site-row-sub">
                      FUZE: {site.fuzeId || '—'} · {site.city || site.state || site.subProject || '—'}
                      {!selectedPilotId && ` · ${pilotNames}`}
                    </div>
                    {isReflySite(site) && site.reflyNotes && (
                      <div className="site-row-refly-notes">🔁 {site.reflyNotes}</div>
                    )}
                    {site.notes && (
                      <div className="site-row-notes-preview">📝 {site.notes}</div>
                    )}
                  </div>
                  <div className="site-row-status" style={{ color }}>
                    {site.mapColor || (site.collectedApp ? 'Collected' : site.partialCollection ? 'Partial' : site.mobFee ? 'MOB Fee' : 'Pending')}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {selectedSite && (
        <AdminSiteDetail site={selectedSite} onClose={() => setSelectedSite(null)} onNotesSave={handleNotesSave} />
      )}
    </div>
  )
}

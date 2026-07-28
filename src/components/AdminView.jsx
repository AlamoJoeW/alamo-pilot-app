import { useEffect, useRef, useState, useCallback } from 'react'
import { fetchAdminData } from '../utils/api'
import { colorForSite, isSiteDone, statusBucketForSite } from '../utils/mapColors'
import { tileLayerFor } from '../utils/mapLayers'
import { quadcopterIcon, makeSiteIcon } from '../utils/mapIcons'
import { sortSites, SORT_OPTIONS } from '../utils/sortSites'
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

// Calendar-day match in the admin's local time zone — a site a pilot marked
// at 11:58pm and one marked at 12:02am both count as "today" relative to
// whenever the office is actually looking at this screen.
function isMarkedToday(site) {
  if (!site.appStatusUpdatedAt) return false
  const d = new Date(site.appStatusUpdatedAt)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
}

// Site marker — same shape-per-icon-type as the pilot's own map (utils/mapIcons.js),
// since the "App Pin Icon" field a pilot sets in SiteDetail is now synced, not local.
function siteIcon(color, pinIcon) {
  return makeSiteIcon(color, pinIcon, 18)
}

// Live pilot location marker — same quadcopter shape as the pilot's own "You are
// here" marker in MapView.jsx, tinted per-pilot via colorForPilot() so they stay
// visually distinguishable on the admin map.
function pilotIcon(color) {
  return quadcopterIcon(color, 30)
}

export default function AdminView() {
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const tileLayerRef = useRef(null)
  const siteMarkersRef = useRef([])
  const pilotMarkersRef = useRef([])

  const [sites, setSites] = useState([])
  const [pilots, setPilots] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [asOf, setAsOf] = useState(null)
  const [hiddenPilotIds, setHiddenPilotIds] = useState(() => new Set())
  const [markedTodayOnly, setMarkedTodayOnly] = useState(false)
  const [satellite, setSatellite] = useState(false)
  const [mode, setMode] = useState('map') // 'map' | 'list'
  const [selectedPilotId, setSelectedPilotId] = useState(null)
  const [selectedSite, setSelectedSite] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortKey, setSortKey] = useState('siteId')

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

  // Initialize map once
  useEffect(() => {
    if (mapInstance.current) return
    const L = window.L
    if (!L) return
    const map = L.map(mapRef.current, { center: [32.7767, -96.7970], zoom: 7, zoomControl: true })
    mapInstance.current = map
    return () => { map.remove(); mapInstance.current = null }
  }, [])

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

  // Redraw site markers
  useEffect(() => {
    const L = window.L
    const map = mapInstance.current
    if (!map || !L) return

    siteMarkersRef.current.forEach(m => m.remove())
    siteMarkersRef.current = []

    const mapped = visibleSites.filter(s => {
      if (!s.lat || !s.lng) return false
      const assigned = s.pilotApp || []
      // Unassigned sites always show; assigned sites show if at least one of
      // their pilots hasn't been toggled off in the chip strip.
      return assigned.length === 0 || assigned.some(id => !hiddenPilotIds.has(id))
    })
    mapped.forEach(site => {
      const color = colorForSite(site)
      const marker = L.marker([site.lat, site.lng], { icon: siteIcon(color, site.pinIcon) })
      const pilotNames = (site.pilotNames || []).join(', ') || 'Unassigned'
      const reflyLine = isReflySite(site) && site.reflyNotes
        ? `<br><em>Refly: ${site.reflyNotes}</em>`
        : ''
      marker.bindTooltip(
        `<strong>${site.siteId || 'Site'}</strong><br>Pilot: ${pilotNames}<br>${site.mapColor || ''}<br>${site.city || ''} ${site.state || ''}${reflyLine}`,
        { direction: 'top', offset: [0, -8] }
      )
      marker.on('click', () => setSelectedSite(site))
      marker.addTo(map)
      siteMarkersRef.current.push(marker)
    })
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
      const color = colorForPilot(p.pilotId)
      const marker = L.marker([p.lat, p.lng], { icon: pilotIcon(color), zIndexOffset: 500 })
      const ago = timeAgo(p.updatedAt) || 'unknown'
      marker.bindTooltip(
        `<strong>${p.name}</strong>${p.travelDay ? ' (travel day)' : ''}<br>Updated ${ago}`,
        { direction: 'top', offset: [0, -14] }
      )
      marker.addTo(map)
      pilotMarkersRef.current.push(marker)
    })
  }, [pilots, hiddenPilotIds])

  // Fit bounds to everything we have — only on a fresh data load, not on chip toggles
  useEffect(() => {
    const L = window.L
    const map = mapInstance.current
    if (!map || !L || !asOf) return
    const allPts = [
      ...sites.filter(s => s.lat && s.lng).map(s => [s.lat, s.lng]),
      ...pilots.filter(p => p.lat && p.lng).map(p => [p.lat, p.lng]),
    ]
    if (allPts.length > 0) {
      map.fitBounds(L.latLngBounds(allPts), { padding: [30, 30], maxZoom: 12 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asOf])

  function togglePilot(pilotId) {
    setHiddenPilotIds(prev => {
      const next = new Set(prev)
      if (next.has(pilotId)) next.delete(pilotId)
      else next.add(pilotId)
      return next
    })
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
  }

  const displaySites = sortSites(
    listSites.filter(s => statusFilter === 'all' || getSiteStatus(s) === statusFilter),
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
          <button className="icon-btn" onClick={load} disabled={loading} title="Refresh">
            {loading ? '⏳' : '⟳'}
          </button>
        </div>
      </div>

      {error && <div className="sync-error">{error}</div>}

      {/* Pilot chip strip — every pilot with at least one site in the "Verizon vHive
          All for KMLs" view, regardless of preflight status. Tap a chip to show/hide
          that pilot's pin + sites on the map; map pins default to everyone visible. */}
      <div className="filter-tabs admin-pilot-strip">
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
            </button>
          )
        })}
      </div>

      <div
        className="map-wrapper admin-map-wrapper"
        style={{ display: mode === 'map' ? 'block' : 'none' }}
      >
        <div ref={mapRef} className="map-container" />
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
      </div>

      {mode === 'list' && (
        <div className="site-list-container admin-site-list">
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
            {displaySites.length === 0 && <div className="empty-state">No sites</div>}
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
        <AdminSiteDetail site={selectedSite} onClose={() => setSelectedSite(null)} />
      )}
    </div>
  )
}

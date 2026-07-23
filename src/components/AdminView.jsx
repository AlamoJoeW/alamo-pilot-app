import { useEffect, useRef, useState, useCallback } from 'react'
import { fetchAdminData } from '../utils/api'
import { colorForMapColor } from '../utils/mapColors'

const SITE_STATUS_COLORS = {
  collected: '#22c55e',
  partial: '#facc15',
  mob: '#f97316',
  none: '#ef4444',
}

const PILOT_COLORS = ['#3b82f6', '#a855f7', '#14b8a6', '#f59e0b', '#ec4899', '#84cc16', '#06b6d4', '#f43f5e']

function colorForPilot(pilotId) {
  let hash = 0
  for (let i = 0; i < pilotId.length; i++) hash = (hash * 31 + pilotId.charCodeAt(i)) >>> 0
  return PILOT_COLORS[hash % PILOT_COLORS.length]
}

function getSiteStatus(site) {
  if (site.collectedApp) return 'collected'
  if (site.partialCollection) return 'partial'
  if (site.mobFee) return 'mob'
  return 'none'
}

// Map Color (office-maintained: Refly, Bird Site, Waiting on a COA, etc.) wins when
// set; otherwise fall back to the pilot-toggled collected/partial/MOB booleans.
function getSiteColor(site) {
  return colorForMapColor(site.mapColor) || SITE_STATUS_COLORS[getSiteStatus(site)]
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

function siteIcon(color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="9" fill="${color}" stroke="white" stroke-width="2"/>
  </svg>`
  return window.L.icon({
    iconUrl: `data:image/svg+xml;base64,${btoa(svg)}`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -9],
  })
}

function pilotIcon(color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">
    <circle cx="15" cy="15" r="12" fill="${color}" fill-opacity="0.25"/>
    <circle cx="15" cy="15" r="7" fill="${color}" stroke="white" stroke-width="2.5"/>
  </svg>`
  return window.L.icon({
    iconUrl: `data:image/svg+xml;base64,${btoa(svg)}`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -15],
  })
}

export default function AdminView() {
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const siteMarkersRef = useRef([])
  const pilotMarkersRef = useRef([])

  const [sites, setSites] = useState([])
  const [pilots, setPilots] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [asOf, setAsOf] = useState(null)
  const [hiddenPilotIds, setHiddenPilotIds] = useState(() => new Set())

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
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map)
    mapInstance.current = map
    return () => { map.remove(); mapInstance.current = null }
  }, [])

  // Redraw site markers
  useEffect(() => {
    const L = window.L
    const map = mapInstance.current
    if (!map || !L) return

    siteMarkersRef.current.forEach(m => m.remove())
    siteMarkersRef.current = []

    const mapped = sites.filter(s => {
      if (!s.lat || !s.lng) return false
      const assigned = s.pilotApp || []
      // Unassigned sites always show; assigned sites show if at least one of
      // their pilots hasn't been toggled off in the chip strip.
      return assigned.length === 0 || assigned.some(id => !hiddenPilotIds.has(id))
    })
    mapped.forEach(site => {
      const color = getSiteColor(site)
      const marker = L.marker([site.lat, site.lng], { icon: siteIcon(color) })
      const pilotNames = (site.pilotNames || []).join(', ') || 'Unassigned'
      marker.bindTooltip(
        `<strong>${site.siteId || 'Site'}</strong><br>Pilot: ${pilotNames}<br>${site.mapColor || ''}<br>${site.city || ''} ${site.state || ''}`,
        { direction: 'top', offset: [0, -8] }
      )
      marker.addTo(map)
      siteMarkersRef.current.push(marker)
    })
  }, [sites, hiddenPilotIds])

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
    return sites.filter(s => (s.pilotApp || []).includes(pilotId))
  }

  return (
    <div className="admin-view">
      <div className="admin-toolbar">
        <div className="admin-toolbar-title">
          Admin — All Pilots
          {asOf && <span className="admin-asof">Refreshed {timeAgo(asOf)}</span>}
        </div>
        <button className="icon-btn" onClick={load} disabled={loading} title="Refresh">
          {loading ? '⏳' : '⟳'}
        </button>
      </div>

      {error && <div className="sync-error">{error}</div>}

      {/* Pilot chip strip — only pilots who've checked in today. Tap a chip to show/hide
          that pilot's pin + sites on the map; map pins default to everyone visible. */}
      <div className="filter-tabs admin-pilot-strip">
        {pilots.filter(p => p.hasPreflightToday).map(p => {
          const s = sitesForPilot(p.pilotId)
          const done = s.filter(x => x.collectedApp || x.partialCollection || x.mobFee).length
          const isHidden = hiddenPilotIds.has(p.pilotId)
          return (
            <button
              key={p.pilotId}
              className={`filter-tab admin-pilot-chip ${isHidden ? 'admin-pilot-chip-off' : 'active'}`}
              onClick={() => togglePilot(p.pilotId)}
              style={{ borderColor: colorForPilot(p.pilotId) }}
              title={isHidden ? 'Hidden — tap to show on map' : 'Visible — tap to hide from map'}
            >
              <span className="admin-pilot-dot" style={{ background: colorForPilot(p.pilotId) }} />
              {p.name} · {done}/{s.length}
            </button>
          )
        })}
      </div>

      <div className="map-wrapper admin-map-wrapper">
        <div ref={mapRef} className="map-container" />
      </div>
    </div>
  )
}

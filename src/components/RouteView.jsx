/**
 * RouteView.jsx
 *
 * Pilot self-service route planning. Replaces the old skill-only flow (which
 * depended on the office running pilot-daily-schedule every morning) with an
 * in-app "Plan My Route" button:
 *
 *   idle       -> "Plan My Route" button
 *   locating   -> grabbing the pilot's current GPS position
 *   checklist  -> pilot checks off which of their eligible sites they can
 *                 actually hit today (they know access/airspace/contact
 *                 status that isn't tracked anywhere else)
 *   route      -> generated route: numbered map + stop list + a pep talk
 *
 * The generated plan is cached locally (IndexedDB, keyed by date) so
 * reopening the app the same day just shows it again, and is written back to
 * the Airtable Daily Assignments table so Admin/office stays in sync. If no
 * local plan exists yet but the server already has one for today (written by
 * this pilot from another device, or still by the skill if it ever runs),
 * that's used to hydrate instead of starting cold.
 *
 * Props:
 *   sites — live site array from App (for eligibility + status coloring)
 */

import { useEffect, useRef, useState } from 'react'
import { fetchDailyRoute, saveDailyRoute } from '../utils/api'
import { tileLayerFor } from '../utils/mapLayers'
import { isRouteEligible, statusBucketForSite } from '../utils/mapColors'
import { haversineMiles, buildRoutePlan, pepTalkFor, formatDriveMinutes } from '../utils/routePlanner'
import { getMeta, setMeta } from '../utils/db'

// ── Numbered SVG marker ──────────────────────────────────────────────────────

function makeNumberedIcon(num, color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">
    <circle cx="15" cy="15" r="13" fill="${color}" stroke="white" stroke-width="2.5"/>
    <text x="15" y="20" text-anchor="middle" fill="white" font-size="13" font-weight="bold" font-family="Arial,sans-serif">${num}</text>
  </svg>`
  return window.L.icon({
    iconUrl: `data:image/svg+xml;base64,${btoa(svg)}`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -15],
  })
}

const STOP_COLORS = { collected: '#22c55e', partial: '#facc15', mob: '#f97316' }

function stopColor(stop, sites) {
  const match = sites.find(s => s.id === stop.recordId || s.siteId === stop.siteId)
  const bucket = match ? statusBucketForSite(match) : null
  return STOP_COLORS[bucket] || '#3b82f6'
}

function todayStr() {
  return new Date().toLocaleDateString('en-CA') // local YYYY-MM-DD, not UTC
}

export default function RouteView({ sites = [] }) {
  const mapRef = useRef(null)
  const mapInst = useRef(null)
  const tileLayerRef = useRef(null)
  const layers = useRef([])

  const [mode, setMode] = useState('loading') // loading | idle | locating | checklist | route
  const [error, setError] = useState('')
  const [satellite, setSatellite] = useState(false)

  const [position, setPosition] = useState(null) // { lat, lng } — pilot's start point
  const [checklistSites, setChecklistSites] = useState([])
  const [checked, setChecked] = useState(() => new Set())
  const [plan, setPlan] = useState(null) // { date, stops, leftover, pepTalk, generatedAt }
  const [generating, setGenerating] = useState(false)
  const [saveWarning, setSaveWarning] = useState('')
  const cameFromRouteRef = useRef(false)

  // ── Load whatever plan already exists (local cache, then server) ───────────
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const stored = await getMeta('routePlan').catch(() => null)
      if (!cancelled && stored && stored.date === todayStr() && stored.stops?.length) {
        setPlan(stored)
        setMode('route')
        return
      }
      try {
        const data = await fetchDailyRoute()
        if (!cancelled && data.exists && data.route?.length) {
          const hydrated = {
            date: todayStr(),
            stops: data.route,
            leftover: [],
            pepTalk: pepTalkFor(data.route.length),
            generatedAt: new Date().toISOString(),
          }
          setPlan(hydrated)
          await setMeta('routePlan', hydrated)
          setMode('route')
          return
        }
      } catch {
        // Non-fatal — no server route yet, or offline. Fall through to idle.
      }
      if (!cancelled) setMode('idle')
    })()
    return () => { cancelled = true }
  }, [])

  // ── Map setup (only mounted while a route is being shown) ──────────────────
  useEffect(() => {
    if (mode !== 'route') return
    if (mapInst.current || !mapRef.current) return
    const L = window.L
    if (!L) return
    const map = L.map(mapRef.current, { center: [32.7767, -96.797], zoom: 8, zoomControl: true })
    mapInst.current = map
    return () => { map.remove(); mapInst.current = null }
  }, [mode])

  useEffect(() => {
    if (mode !== 'route') return
    const L = window.L
    const map = mapInst.current
    if (!map || !L) return
    if (tileLayerRef.current) map.removeLayer(tileLayerRef.current)
    const tile = tileLayerFor(satellite)
    tileLayerRef.current = L.tileLayer(tile.url, tile.options).addTo(map)
  }, [satellite, mode])

  useEffect(() => {
    if (mode !== 'route' || !plan) return
    const L = window.L
    const map = mapInst.current
    if (!map || !L) return
    layers.current.forEach(l => l.remove())
    layers.current = []
    const valid = plan.stops.filter(s => s.lat && s.lng)
    if (!valid.length) return
    const line = L.polyline(valid.map(s => [s.lat, s.lng]), {
      color: '#3b82f6', weight: 3, opacity: 0.65, dashArray: '8,5',
    }).addTo(map)
    layers.current.push(line)
    valid.forEach((stop, i) => {
      const marker = L.marker([stop.lat, stop.lng], { icon: makeNumberedIcon(i + 1, stopColor(stop, sites)) })
      const t = stop.scheduledArrival ? `<br>⏰ ${stop.scheduledArrival}` : ''
      marker.bindTooltip(
        `<strong>#${i + 1} — ${stop.siteId || 'Site'}</strong>${t}<br>${[stop.city, stop.state].filter(Boolean).join(', ')}`,
        { direction: 'top', offset: [0, -10] }
      )
      marker.addTo(map)
      layers.current.push(marker)
    })
    map.fitBounds(L.latLngBounds(valid.map(s => [s.lat, s.lng])), { padding: [30, 30], maxZoom: 12 })
  }, [plan, sites, mode])

  // ── Actions ──────────────────────────────────────────────────────────────

  function buildChecklist(lat, lng, preselectIds) {
    const eligible = sites
      .filter(isRouteEligible)
      .map(s => ({ ...s, distanceMi: haversineMiles(lat, lng, s.lat, s.lng) }))
      .sort((a, b) => a.distanceMi - b.distanceMi)
    setChecklistSites(eligible)
    setChecked(new Set(preselectIds ? eligible.filter(s => preselectIds.has(s.id)).map(s => s.id) : []))
    setMode('checklist')
  }

  function locateThenBuildChecklist(preselectIds) {
    setError('')
    if (!navigator.geolocation) {
      setError('GPS not available on this device.')
      setMode(cameFromRouteRef.current ? 'route' : 'idle')
      return
    }
    setMode('locating')
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude, longitude } = pos.coords
        setPosition({ lat: latitude, lng: longitude })
        buildChecklist(latitude, longitude, preselectIds)
      },
      () => {
        setError('Unable to get your location — check Location permissions and try again.')
        setMode(cameFromRouteRef.current ? 'route' : 'idle')
      },
      { enableHighAccuracy: true, timeout: 15000 }
    )
  }

  function handlePlan() {
    cameFromRouteRef.current = false
    locateThenBuildChecklist()
  }

  function handleReplan() {
    cameFromRouteRef.current = true
    const prevIds = new Set([...(plan?.stops || []), ...(plan?.leftover || [])].map(s => s.recordId))
    locateThenBuildChecklist(prevIds)
  }

  function toggleChecked(id) {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    setChecked(new Set(checklistSites.map(s => s.id)))
  }

  function selectNone() {
    setChecked(new Set())
  }

  async function generateRoute() {
    if (checked.size === 0 || !position) return
    setGenerating(true)
    setSaveWarning('')
    try {
      const chosen = checklistSites.filter(s => checked.has(s.id))
      const built = buildRoutePlan({ sites: chosen, startLat: position.lat, startLng: position.lng })
      const fmt = d => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      const planObj = {
        date: todayStr(),
        stops: built.stops,
        leftover: built.leftover,
        pepTalk: pepTalkFor(built.stops.length),
        generatedAt: built.generatedAt,
        // Same header info the skill's Word doc shows per pilot — sunrise/sunset
        // and the padded ops window they were scheduled against.
        sunriseLabel: fmt(built.sunrise),
        sunsetLabel: fmt(built.sunset),
        opsStartLabel: fmt(built.opsStart),
        opsEndLabel: fmt(built.opsEnd),
      }
      setPlan(planObj)
      await setMeta('routePlan', planObj)
      setMode('route')
      try {
        await saveDailyRoute(built.stops)
      } catch (err) {
        setSaveWarning('Route saved on your phone, but syncing to the office failed — will retry next time you generate or replan.')
      }
    } finally {
      setGenerating(false)
    }
  }

  function cancelChecklist() {
    setMode(cameFromRouteRef.current && plan ? 'route' : 'idle')
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (mode === 'loading') {
    return <div className="route-state">Checking today's route…</div>
  }

  if (mode === 'idle') {
    return (
      <div className="route-state route-idle">
        <p className="route-idle-title">No route planned yet today.</p>
        <p className="route-idle-sub">Check off which of your sites you can actually hit, and we'll build the route.</p>
        {error && <p className="route-state-error">{error}</p>}
        <button className="btn-primary" onClick={handlePlan}>Plan My Route</button>
      </div>
    )
  }

  if (mode === 'locating') {
    return <div className="route-state">Getting your location…</div>
  }

  if (mode === 'checklist') {
    const anyChecked = checked.size > 0
    return (
      <div className="route-checklist-view">
        <div className="route-checklist-header">
          <div>
            <div className="route-checklist-title">Which sites can you hit today?</div>
            <div className="route-checklist-sub">Sorted by distance from your current location. Uncheck anything you know isn't doable.</div>
          </div>
        </div>
        <div className="route-checklist-toolbar">
          <button className="route-checklist-link" onClick={selectAll}>Select all</button>
          <button className="route-checklist-link" onClick={selectNone}>Clear</button>
          <button className="route-checklist-link route-checklist-cancel" onClick={cancelChecklist}>Cancel</button>
        </div>
        <div className="route-checklist-list">
          {checklistSites.length === 0 && (
            <div className="empty-state">No eligible sites found for your account.</div>
          )}
          {checklistSites.map(site => (
            <label key={site.id} className="route-checklist-row">
              <input
                type="checkbox"
                className="site-row-checkbox"
                checked={checked.has(site.id)}
                onChange={() => toggleChecked(site.id)}
              />
              <div className="route-checklist-info">
                <div className="route-checklist-id">{site.siteId || '—'}</div>
                <div className="route-checklist-sub-row">
                  {[site.city, site.state].filter(Boolean).join(', ') || '—'}
                  {site.mapColor && <span className="route-checklist-badge">{site.mapColor}</span>}
                </div>
              </div>
              <div className="route-checklist-distance">{site.distanceMi.toFixed(1)} mi</div>
            </label>
          ))}
        </div>
        <div className="route-checklist-footer">
          <span>{checked.size} selected</span>
          <button className="btn-primary" disabled={!anyChecked || generating} onClick={generateRoute}>
            {generating ? 'Generating…' : 'Generate Route'}
          </button>
        </div>
      </div>
    )
  }

  // mode === 'route'
  const doneCount = plan.stops.filter(stop => {
    const m = sites.find(s => s.id === stop.recordId || s.siteId === stop.siteId)
    return m && statusBucketForSite(m) !== null
  }).length

  return (
    <div className="route-view">
      <div className="route-map-container">
        <div ref={mapRef} className="route-map" />
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

      {saveWarning && <div className="route-save-warning">{saveWarning}</div>}
      {error && <div className="route-save-warning">{error}</div>}

      <div className="route-summary">
        <span>{doneCount} / {plan.stops.length} stops done</span>
        <button className="route-replan-btn" onClick={handleReplan}>Replan</button>
      </div>

      {/* Same at-a-glance line the skill's Word doc puts at the top of each
          pilot's section — only available on a freshly-generated plan (a
          route hydrated cold from the server won't have it). */}
      {plan.sunriseLabel && (
        <div className="route-sun-info">
          Sunrise {plan.sunriseLabel} · Ops {plan.opsStartLabel}–{plan.opsEndLabel} · Sunset {plan.sunsetLabel}
        </div>
      )}

      <div className="route-list">
        {plan.stops.map((stop, i) => {
          const m = sites.find(s => s.id === stop.recordId || s.siteId === stop.siteId)
          const done = m && statusBucketForSite(m) !== null
          const collectWindow = stop.scheduledArrival && stop.scheduledFinish
            ? `${stop.scheduledArrival} – ${stop.scheduledFinish}`
            : stop.scheduledArrival || ''
          return (
            <div key={stop.recordId || i} className={`route-stop${done ? ' done' : ''}`}>
              <div className="route-stop-top">
                <div className="route-stop-num" style={{ background: stopColor(stop, sites) }}>{i + 1}</div>
                <div className="route-stop-id">{stop.siteId || `Stop ${i + 1}`}</div>
                {stop.mapColor && <span className="route-checklist-badge">{stop.mapColor}</span>}
              </div>
              <div className="route-stop-addr">{[stop.address, stop.city, stop.state].filter(Boolean).join(', ')}</div>
              <div className="route-stop-stats">
                {stop.driveMinutes != null && <span>Drive {formatDriveMinutes(stop.driveMinutes)}</span>}
                {stop.scheduledArrival && <span>Arrive {stop.scheduledArrival}</span>}
                {collectWindow && <span>Collect {collectWindow}</span>}
              </div>
            </div>
          )
        })}

        {plan.leftover?.length > 0 && (
          <div className="route-leftover">
            <div className="route-leftover-title">Didn't fit today's window ({plan.leftover.length})</div>
            {plan.leftover.map((stop, i) => (
              <div key={stop.recordId || i} className="route-leftover-row">
                <div className="route-leftover-top">
                  <span>{stop.siteId || 'Site'}</span>
                  {stop.mapColor && <span className="route-checklist-badge">{stop.mapColor}</span>}
                </div>
                <span className="route-leftover-sub">{[stop.address, stop.city, stop.state].filter(Boolean).join(', ')}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="route-pep-talk">{plan.pepTalk}</div>
    </div>
  )
}

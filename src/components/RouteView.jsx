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
 * Today / Tomorrow — once today's EOD is submitted (eodSubmittedToday prop),
 * a second tab unlocks for planning tomorrow's route: same checklist/generate
 * flow, but scheduled against tomorrow's sunrise/sunset window and started
 * from wherever the pilot's GPS says they are right now (hotel that night,
 * breakfast the next morning, wherever) instead of today's ops window. The
 * two tabs are independent plans/state — `days.today` and `days.tomorrow` —
 * driven by the same generic, day-parameterized handlers below rather than
 * duplicated code.
 *
 * Tomorrow's plan is cached locally (IndexedDB, under a separate 'tomorrow'
 * meta key) and written to the *next day's* Daily Assignments record
 * (api/daily-route.js now takes an optional `date`). No extra rollover step
 * is needed server-side — once that date is actually "today," the normal
 * undated GET just finds it. Client-side, the load effect below explicitly
 * promotes a cached tomorrow-plan into the today-plan slot once its date
 * matches the current Central calendar date, so reopening the app the next
 * day shows it immediately under the Today tab instead of the Tomorrow tab.
 *
 * Props:
 *   sites             — live site array from App (for eligibility + status coloring)
 *   eodSubmittedToday — whether today's EOD is already on file; gates the
 *                       Tomorrow tab (Joe: next-day planning shouldn't be
 *                       offered until today's flying is actually done)
 */

import { useEffect, useRef, useState } from 'react'
import { fetchDailyRoute, saveDailyRoute } from '../utils/api'
import { tileLayerFor } from '../utils/mapLayers'
import { isRouteEligible, statusBucketForSite } from '../utils/mapColors'
import { haversineMiles, buildRoutePlan, pepTalkFor, formatDriveMinutes, opsWindowFor, directFitsToday } from '../utils/routePlanner'
import { getMeta, setMeta } from '../utils/db'
import { centralDateStr, addDaysToDateStr } from '../utils/centralTime'

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

// ── Per-day state ────────────────────────────────────────────────────────────

function emptyDayState() {
  return {
    mode: 'loading', // loading | idle | locating | checklist | route
    error: '',
    position: null, // { lat, lng } — pilot's start point
    checklistSites: [],
    checklistFilteredCount: 0,
    checked: new Set(),
    plan: null, // { date, stops, leftover, pepTalk, generatedAt }
    generating: false,
    saveWarning: '',
    cameFromRoute: false, // Replan came from the route screen -> Cancel returns there
  }
}

// A real Date object standing in for "today" or "tomorrow" — only used to
// feed the sunrise/sunset calc in routePlanner.js, which just needs any
// instant within the target day (see opsWindowFor). +24h is precise enough
// given the 90-minute padding already applied on both ends of the window.
function dateForDay(day) {
  return day === 'tomorrow' ? new Date(Date.now() + 24 * 60 * 60 * 1000) : new Date()
}

function dateStrForDay(day) {
  const todayD = centralDateStr()
  return day === 'tomorrow' ? addDaysToDateStr(todayD, 1) : todayD
}

export default function RouteView({ sites = [], eodSubmittedToday = false }) {
  const mapRef = useRef(null)
  const mapInst = useRef(null)
  const tileLayerRef = useRef(null)
  const layers = useRef([])

  const [planningDay, setPlanningDay] = useState('today') // 'today' | 'tomorrow'
  const [days, setDays] = useState({ today: emptyDayState(), tomorrow: emptyDayState() })
  const [satellite, setSatellite] = useState(false)

  const active = days[planningDay]

  function updateDay(day, patch) {
    setDays(prev => ({ ...prev, [day]: { ...prev[day], ...patch } }))
  }

  // If today's EOD gets un-submitted somehow (shouldn't happen in normal use,
  // but defensive) or the pilot logs into a fresh day, don't strand them on a
  // locked Tomorrow tab.
  useEffect(() => {
    if (!eodSubmittedToday && planningDay === 'tomorrow') setPlanningDay('today')
  }, [eodSubmittedToday, planningDay])

  // ── Load whatever plans already exist (local cache, then server) ───────────
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const todayD = centralDateStr()
      const tomorrowD = addDaysToDateStr(todayD, 1)

      // "Today" — local cache first, then a same-date "tomorrow" cache that's
      // rolled over (planned last night, now actually today), then server.
      let todayPlan = null
      const storedToday = await getMeta('routePlan').catch(() => null)
      if (storedToday && storedToday.date === todayD && storedToday.stops?.length) {
        todayPlan = storedToday
      } else {
        const storedTomorrow = await getMeta('routePlanTomorrow').catch(() => null)
        if (storedTomorrow && storedTomorrow.date === todayD && storedTomorrow.stops?.length) {
          todayPlan = storedTomorrow
          await setMeta('routePlan', storedTomorrow)
          await setMeta('routePlanTomorrow', null)
        }
      }
      if (!todayPlan) {
        try {
          const data = await fetchDailyRoute()
          if (data.exists && data.route?.length) {
            todayPlan = {
              date: todayD,
              stops: data.route,
              leftover: [],
              pepTalk: pepTalkFor(data.route.length),
              generatedAt: new Date().toISOString(),
            }
            await setMeta('routePlan', todayPlan)
          }
        } catch {
          // Non-fatal — no server route yet, or offline. Fall through to idle.
        }
      }

      // "Tomorrow" — local cache (re-read here rather than reusing a variable
      // from the block above, since a rollover just above may have cleared
      // it), else server. Only counts if still actually dated tomorrow.
      let tomorrowPlan = null
      const storedTomorrowNow = await getMeta('routePlanTomorrow').catch(() => null)
      if (storedTomorrowNow && storedTomorrowNow.date === tomorrowD && storedTomorrowNow.stops?.length) {
        tomorrowPlan = storedTomorrowNow
      }
      if (!tomorrowPlan) {
        try {
          const data = await fetchDailyRoute(tomorrowD)
          if (data.exists && data.route?.length) {
            tomorrowPlan = {
              date: tomorrowD,
              stops: data.route,
              leftover: [],
              pepTalk: pepTalkFor(data.route.length, "tomorrow's"),
              generatedAt: new Date().toISOString(),
            }
            await setMeta('routePlanTomorrow', tomorrowPlan)
          }
        } catch {
          // Non-fatal — no server route yet, or offline.
        }
      }

      if (cancelled) return
      setDays({
        today: { ...emptyDayState(), plan: todayPlan, mode: todayPlan ? 'route' : 'idle' },
        tomorrow: { ...emptyDayState(), plan: tomorrowPlan, mode: tomorrowPlan ? 'route' : 'idle' },
      })
    })()
    return () => { cancelled = true }
  }, [])

  // ── Map setup (only mounted while a route is being shown) ──────────────────
  useEffect(() => {
    if (active.mode !== 'route') return
    if (mapInst.current || !mapRef.current) return
    const L = window.L
    if (!L) return
    const map = L.map(mapRef.current, { center: [32.7767, -96.797], zoom: 8, zoomControl: true })
    mapInst.current = map
    return () => { map.remove(); mapInst.current = null }
  }, [active.mode])

  useEffect(() => {
    if (active.mode !== 'route') return
    const L = window.L
    const map = mapInst.current
    if (!map || !L) return
    if (tileLayerRef.current) map.removeLayer(tileLayerRef.current)
    const tile = tileLayerFor(satellite)
    tileLayerRef.current = L.tileLayer(tile.url, tile.options).addTo(map)
  }, [satellite, active.mode])

  useEffect(() => {
    if (active.mode !== 'route' || !active.plan) return
    const L = window.L
    const map = mapInst.current
    if (!map || !L) return
    layers.current.forEach(l => l.remove())
    layers.current = []
    const valid = active.plan.stops.filter(s => s.lat && s.lng)
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
  }, [active.plan, sites, active.mode])

  // ── Actions (all parameterized by `day` — 'today' | 'tomorrow') ────────────

  function buildChecklist(day, lat, lng, preselectIds) {
    const { opsStart, opsEnd } = opsWindowFor(dateForDay(day), lat, lng)
    const allEligible = sites.filter(isRouteEligible)
    // Only list sites actually reachable within the target day's ops window —
    // a straight-line drive from here plus a full collection has to finish
    // before it closes. Sites too far away just don't show up on the
    // checklist at all, rather than getting checked and then bumped to
    // "didn't fit" after Generate Route.
    const reachable = allEligible
      .filter(s => directFitsToday(lat, lng, s.lat, s.lng, opsStart, opsEnd))
      .map(s => ({ ...s, distanceMi: haversineMiles(lat, lng, s.lat, s.lng) }))
      .sort((a, b) => a.distanceMi - b.distanceMi)
    updateDay(day, {
      checklistSites: reachable,
      checklistFilteredCount: allEligible.length - reachable.length,
      checked: new Set(preselectIds ? reachable.filter(s => preselectIds.has(s.id)).map(s => s.id) : []),
      mode: 'checklist',
    })
  }

  // `cameFromRoute` is passed explicitly (not read back off state inside the
  // geolocation callback) so a slow GPS fix can't race a state change made
  // elsewhere in the meantime.
  function locateThenBuildChecklist(day, preselectIds, cameFromRoute = false) {
    updateDay(day, { error: '', cameFromRoute })
    if (!navigator.geolocation) {
      updateDay(day, { error: 'GPS not available on this device.', mode: cameFromRoute ? 'route' : 'idle' })
      return
    }
    updateDay(day, { mode: 'locating' })
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude, longitude } = pos.coords
        updateDay(day, { position: { lat: latitude, lng: longitude } })
        buildChecklist(day, latitude, longitude, preselectIds)
      },
      () => {
        updateDay(day, { error: 'Unable to get your location — check Location permissions and try again.', mode: cameFromRoute ? 'route' : 'idle' })
      },
      { enableHighAccuracy: true, timeout: 15000 }
    )
  }

  function handlePlan(day) {
    locateThenBuildChecklist(day, undefined, false)
  }

  function handleReplan(day) {
    const d = days[day]
    const prevIds = new Set([...(d.plan?.stops || []), ...(d.plan?.leftover || [])].map(s => s.recordId))
    locateThenBuildChecklist(day, prevIds, true)
  }

  function toggleChecked(day, id) {
    setDays(prev => {
      const next = new Set(prev[day].checked)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { ...prev, [day]: { ...prev[day], checked: next } }
    })
  }

  function selectAll(day) {
    updateDay(day, { checked: new Set(days[day].checklistSites.map(s => s.id)) })
  }

  function selectNone(day) {
    updateDay(day, { checked: new Set() })
  }

  async function generateRoute(day) {
    const d = days[day]
    if (d.checked.size === 0 || !d.position) return
    updateDay(day, { generating: true, saveWarning: '' })
    try {
      const chosen = d.checklistSites.filter(s => d.checked.has(s.id))
      const built = buildRoutePlan({ sites: chosen, startLat: d.position.lat, startLng: d.position.lng, date: dateForDay(day) })
      const fmt = dt => dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      const dayStr = dateStrForDay(day)
      const planObj = {
        date: dayStr,
        stops: built.stops,
        leftover: built.leftover,
        pepTalk: pepTalkFor(built.stops.length, day === 'tomorrow' ? "tomorrow's" : "today's"),
        generatedAt: built.generatedAt,
        // Same header info the skill's Word doc shows per pilot — sunrise/sunset
        // and the padded ops window they were scheduled against.
        sunriseLabel: fmt(built.sunrise),
        sunsetLabel: fmt(built.sunset),
        opsStartLabel: fmt(built.opsStart),
        opsEndLabel: fmt(built.opsEnd),
      }
      updateDay(day, { plan: planObj, mode: 'route' })
      await setMeta(day === 'tomorrow' ? 'routePlanTomorrow' : 'routePlan', planObj)
      try {
        await saveDailyRoute(built.stops, day === 'tomorrow' ? dayStr : undefined)
      } catch (err) {
        updateDay(day, { saveWarning: 'Route saved on your phone, but syncing to the office failed — will retry next time you generate or replan.' })
      }
    } finally {
      updateDay(day, { generating: false })
    }
  }

  function cancelChecklist(day) {
    const d = days[day]
    updateDay(day, { mode: d.cameFromRoute && d.plan ? 'route' : 'idle' })
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const dayLabel = planningDay === 'tomorrow' ? 'tomorrow' : 'today'

  // Today/Tomorrow toggle — Tomorrow stays locked until today's EOD is on file.
  const dayToggle = (
    <div className="route-day-toggle">
      <button
        className={`route-day-btn${planningDay === 'today' ? ' active' : ''}`}
        onClick={() => setPlanningDay('today')}
      >
        Today
      </button>
      <button
        className={`route-day-btn${planningDay === 'tomorrow' ? ' active' : ''}`}
        onClick={() => eodSubmittedToday && setPlanningDay('tomorrow')}
        disabled={!eodSubmittedToday}
        title={!eodSubmittedToday ? "Submit today's EOD to plan tomorrow's route" : ''}
      >
        {!eodSubmittedToday && '🔒 '}Tomorrow
      </button>
    </div>
  )

  if (active.mode === 'loading') {
    return <div className="route-state">Checking {dayLabel}'s route…</div>
  }

  if (active.mode === 'idle') {
    return (
      <div className="route-view-shell">
        {dayToggle}
        <div className="route-state route-idle">
          <p className="route-idle-title">No route planned yet {dayLabel === 'today' ? 'today' : 'for tomorrow'}.</p>
          <p className="route-idle-sub">Check off which of your sites you can actually hit, and we'll build the route.</p>
          {active.error && <p className="route-state-error">{active.error}</p>}
          <button className="btn-primary" onClick={() => handlePlan(planningDay)}>
            {planningDay === 'tomorrow' ? "Plan Tomorrow's Route" : 'Plan My Route'}
          </button>
        </div>
      </div>
    )
  }

  if (active.mode === 'locating') {
    return (
      <div className="route-view-shell">
        {dayToggle}
        <div className="route-state">Getting your location…</div>
      </div>
    )
  }

  if (active.mode === 'checklist') {
    const anyChecked = active.checked.size > 0
    return (
      <div className="route-checklist-view">
        {dayToggle}
        <div className="route-checklist-header">
          <div>
            <div className="route-checklist-title">Which sites can you hit {dayLabel}?</div>
            <div className="route-checklist-sub">
              {planningDay === 'tomorrow'
                ? "Sorted by distance from your current location — only sites reachable within tomorrow's daylight window are listed. Uncheck anything you know isn't doable."
                : "Sorted by distance from your current location — only sites within today's remaining driving distance are listed. Uncheck anything you know isn't doable."}
            </div>
          </div>
        </div>
        <div className="route-checklist-toolbar">
          <button className="route-checklist-link" onClick={() => selectAll(planningDay)}>Select all</button>
          <button className="route-checklist-link" onClick={() => selectNone(planningDay)}>Clear</button>
          <button className="route-checklist-link route-checklist-cancel" onClick={() => cancelChecklist(planningDay)}>Cancel</button>
        </div>
        {active.checklistFilteredCount > 0 && (
          <div className="route-checklist-note">
            {active.checklistFilteredCount} other assigned site{active.checklistFilteredCount === 1 ? '' : 's'} hidden — too far to reach within {dayLabel === 'tomorrow' ? "tomorrow's daylight window" : "today's remaining daylight"}.
          </div>
        )}
        <div className="route-checklist-list">
          {active.checklistSites.length === 0 && (
            <div className="empty-state">
              {active.checklistFilteredCount > 0
                ? `None of your assigned sites are within ${dayLabel === 'tomorrow' ? "tomorrow's" : "today's"} reach.`
                : 'No eligible sites found for your account.'}
            </div>
          )}
          {active.checklistSites.map(site => (
            <label key={site.id} className="route-checklist-row">
              <input
                type="checkbox"
                className="site-row-checkbox"
                checked={active.checked.has(site.id)}
                onChange={() => toggleChecked(planningDay, site.id)}
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
          <span>{active.checked.size} selected</span>
          <button className="btn-primary" disabled={!anyChecked || active.generating} onClick={() => generateRoute(planningDay)}>
            {active.generating ? 'Generating…' : 'Generate Route'}
          </button>
        </div>
      </div>
    )
  }

  // mode === 'route'
  const plan = active.plan
  const doneCount = plan.stops.filter(stop => {
    const m = sites.find(s => s.id === stop.recordId || s.siteId === stop.siteId)
    return m && statusBucketForSite(m) !== null
  }).length

  return (
    <div className="route-view">
      {dayToggle}
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

      {active.saveWarning && <div className="route-save-warning">{active.saveWarning}</div>}
      {active.error && <div className="route-save-warning">{active.error}</div>}

      <div className="route-summary">
        {planningDay === 'tomorrow'
          ? <span>{plan.stops.length} stop{plan.stops.length === 1 ? '' : 's'} planned for tomorrow</span>
          : <span>{doneCount} / {plan.stops.length} stops done</span>}
        <button className="route-replan-btn" onClick={() => handleReplan(planningDay)}>Replan</button>
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
            <div className="route-leftover-title">Didn't fit {dayLabel === 'tomorrow' ? "tomorrow's" : "today's"} window ({plan.leftover.length})</div>
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

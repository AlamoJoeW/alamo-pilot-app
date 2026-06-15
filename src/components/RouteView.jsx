/**
 * RouteView.jsx
 * Displays the pilot's daily ordered route from the Daily Assignments table.
 * Shows numbered markers on a Leaflet map + scrollable stop list below.
 *
 * Props:
 *   sites  â live site array from App (for collection-status coloring)
 */

import { useEffect, useRef, useState } from 'react'
import { fetchDailyRoute } from '../utils/api'

// ââ Numbered SVG marker ââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

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

function stopColor(stop, sites) {
  const match = sites.find(s => s.siteId === stop.siteId || s.id === stop.recordId)
  if (!match) return '#3b82f6'
  if (match.collectedApp) return '#22c55e'
  if (match.partialCollection) return '#facc15'
  if (match.mobFee) return '#f97316'
  return '#3b82f6'
}

export default function RouteView({ sites = [] }) {
  const mapRef  = useRef(null)
  const mapInst = useRef(null)
  const layers  = useRef([])
  const [route,   setRoute]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  useEffect(() => {
    fetchDailyRoute()
      .then(data => { setRoute(data.route || []); setLoading(false) })
      .catch(err  => { setError(err.message || 'Failed to load route'); setLoading(false) })
  }, [])

  useEffect(() => {
    if (mapInst.current || !mapRef.current) return
    const L = window.L
    if (!L) return
    const map = L.map(mapRef.current, { center: [32.7767, -96.7970], zoom: 8, zoomControl: true })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: 'Â© OpenStreetMap contributors', maxZoom: 19,
    }).addTo(map)
    mapInst.current = map
    return () => { map.remove(); mapInst.current = null }
  }, [])

  useEffect(() => {
    const L = window.L, map = mapInst.current
    if (!map || !L) return
    layers.current.forEach(l => l.remove())
    layers.current = []
    const valid = route.filter(s => s.lat && s.lng)
    if (!valid.length) return
    const line = L.polyline(valid.map(s => [s.lat, s.lng]), {
      color: '#3b82f6', weight: 3, opacity: 0.65, dashArray: '8,5',
    }).addTo(map)
    layers.current.push(line)
    valid.forEach((stop, i) => {
      const marker = L.marker([stop.lat, stop.lng], { icon: makeNumberedIcon(i + 1, stopColor(stop, sites)) })
      const t = stop.scheduledArrival ? `<br>â° ${stop.scheduledArrival}` : ''
      marker.bindTooltip(`<strong>#${i+1} â ${stop.siteId||'Site'}</strong>${t}<br>${[stop.city,stop.state].filter(Boolean).join(', ')}`,
        { direction: 'top', offset: [0, -10] })
      marker.addTo(map); layers.current.push(marker)
    })
    map.fitBounds(L.latLngBounds(valid.map(s => [s.lat, s.lng])), { padding: [30,30], maxZoom: 12 })
  }, [route, sites])

  if (loading) return <div className="route-state">Loading today's routeâ¦</div>
  if (error)   return <div className="route-state route-state-error">{error}</div>
  if (!route.length) return (
    <div className="route-state">
      <div style={{fontSize:48,marginBottom:12}}>ðºï¸</div>
      <p style={{fontWeight:600}}>No route assigned yet.</p>
      <p style={{color:'var(--text2)',fontSize:14,marginTop:4}}>
        Routes are generated at 8:30 AM each morning.
      </p>
    </div>
  )

  const doneCount = route.filter(stop => {
    const m = sites.find(s => s.siteId === stop.siteId || s.id === stop.recordId)
    return m?.collectedApp || m?.partialCollection || m?.mobFee
  }).length

  return (
    <div className="route-view">
      <div ref={mapRef} className="route-map" />
      <div className="route-summary">
        <span>{doneCount} / {route.length} stops done</span>
        <div className="route-legend">
          <span className="legend-dot" style={{background:'#3b82f6'}} /> Pending
          <span className="legend-dot" style={{background:'#22c55e',marginLeft:10}} /> Done
        </div>
      </div>
      <div className="route-list">
        {route.map((stop, i) => {
          const m = sites.find(s => s.siteId === stop.siteId || s.id === stop.recordId)
          const done = m?.collectedApp || m?.partialCollection || m?.mobFee
          return (
            <div key={i} className={`route-stop${done?' done':''}`}>
              <div className="route-stop-num" style={{background:stopColor(stop,sites)}}>{i+1}</div>
              <div className="route-stop-info">
                <div className="route-stop-id">{stop.siteId||`Stop ${i+1}`}</div>
                <div className="route-stop-addr">{[stop.address,stop.city,stop.state].filter(Boolean).join(', ')}</div>
              </div>
              {stop.scheduledArrival && <div className="route-stop-time">{stop.scheduledArrival}</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

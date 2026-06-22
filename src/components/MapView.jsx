import { useEffect, useRef, useState } from 'react'

const STATUS_COLORS = {
  collected: '#22c55e',
  partial: '#facc15',
  mob: '#f97316',
  none: '#ef4444',
  issue: '#ef4444',
}

function getSiteStatus(site) {
  if (site.collectedApp) return 'collected'
  if (site.partialCollection) return 'partial'
  if (site.mobFee) return 'mob'
  if (site.siteIssue) return 'issue'
  return 'none'
}

function makeIcon(color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" fill="${color}" stroke="white" stroke-width="2"/>
  </svg>`
  const url = `data:image/svg+xml;base64,${btoa(svg)}`
  return window.L.icon({
    iconUrl: url,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  })
}

function makeLocateDotIcon() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="8" fill="#3b82f6" stroke="white" stroke-width="3"/>
    <circle cx="12" cy="12" r="12" fill="#3b82f6" fill-opacity="0.2"/>
  </svg>`
  const url = `data:image/svg+xml;base64,${btoa(svg)}`
  return window.L.icon({
    iconUrl: url,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  })
}

export default function MapView({ sites, onSelect }) {
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const markersRef = useRef([])
  const locateMarkerRef = useRef(null)
  const [locating, setLocating] = useState(false)
  const [locateError, setLocateError] = useState(null)

  // Initialize map once
  useEffect(() => {
    if (mapInstance.current) return

    const L = window.L
    if (!L) return
    const map = L.map(mapRef.current, {
      center: [32.7767, -96.7970],
      zoom: 8,
      zoomControl: true,
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map)

    mapInstance.current = map

    return () => {
      map.remove()
      mapInstance.current = null
    }
  }, [])

  // Update markers when sites change
  useEffect(() => {
    const L = window.L
    const map = mapInstance.current
    if (!map || !L) return

    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    const mapped = sites.filter(s => s.lat && s.lng)

    mapped.forEach(site => {
      const status = getSiteStatus(site)
      const color = STATUS_COLORS[status]
      const marker = L.marker([site.lat, site.lng], { icon: makeIcon(color) })

      marker.on('click', () => onSelect(site))
      marker.bindTooltip(
        `<strong>${site.siteId || 'Site'}</strong><br>FUZE: ${site.fuzeId || '—'}<br>${site.city || ''} ${site.state || ''}`,
        { direction: 'top', offset: [0, -8] }
      )

      marker.addTo(map)
      markersRef.current.push(marker)
    })

    if (mapped.length > 0) {
      const bounds = L.latLngBounds(mapped.map(s => [s.lat, s.lng]))
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 })
    }
  }, [sites, onSelect])

  function handleLocate() {
    if (!navigator.geolocation) {
      setLocateError('GPS not available')
      return
    }
    setLocating(true)
    setLocateError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        const L = window.L
        const map = mapInstance.current
        if (!map || !L) return

        // Remove previous locate marker
        if (locateMarkerRef.current) {
          locateMarkerRef.current.remove()
        }

        // Place blue dot at current location
        const marker = L.marker([latitude, longitude], { icon: makeLocateDotIcon(), zIndexOffset: 1000 })
        marker.bindTooltip('You are here', { permanent: false, direction: 'top', offset: [0, -8] })
        marker.addTo(map)
        locateMarkerRef.current = marker

        // Pan to location at a reasonable zoom
        map.setView([latitude, longitude], Math.max(map.getZoom(), 13))
        setLocating(false)
      },
      (err) => {
        setLocating(false)
        setLocateError('Unable to get location')
        setTimeout(() => setLocateError(null), 3000)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  return (
    <div className="map-wrapper">
      <div ref={mapRef} className="map-container" />
      <button
        className={`map-locate-btn${locating ? ' locating' : ''}`}
        onClick={handleLocate}
        title="Center on my location"
        aria-label="Center map on my location"
      >
        {locating ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10" strokeOpacity="0.3"/>
            <path d="M12 2 A10 10 0 0 1 22 12" strokeLinecap="round"/>
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="3" fill="currentColor"/>
            <circle cx="12" cy="12" r="8"/>
            <line x1="12" y1="2" x2="12" y2="4"/>
            <line x1="12" y1="20" x2="12" y2="22"/>
            <line x1="2" y1="12" x2="4" y2="12"/>
            <line x1="20" y1="12" x2="22" y2="12"/>
          </svg>
        )}
      </button>
      {locateError && (
        <div className="map-locate-error">{locateError}</div>
      )}
    </div>
  )
}

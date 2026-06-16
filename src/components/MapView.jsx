import { useEffect, useRef } from 'react'

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
  // SVG circle marker — works offline, no external assets needed
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" fill="${color}" stroke="white" stroke-width="2"/>
  </svg>`
  const url = `data:image/svg+xml;base64,${btoa(svg)}`
  // Use global L from Leaflet loaded via CDN in index.html
  return window.L.icon({
    iconUrl: url,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  })
}

export default function MapView({ sites, onSelect }) {
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const markersRef = useRef([])
  const cleanupRef = useRef(null)

  // Initialize map once
  useEffect(() => {
    if (mapInstance.current) return

    let cancelled = false

    const tryInit = () => {
      if (cancelled) return
      const L = window.L
      if (!L) {
        // Leaflet CDN not loaded yet — retry
        setTimeout(tryInit, 200)
        return
      }

      const map = L.map(mapRef.current, {
        center: [32.7767, -96.7970], // Default: Dallas, TX
        zoom: 8,
        zoomControl: true,
      })

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map)

      mapInstance.current = map

      // Leaflet measures the container at mount time; the flex layout may not
      // have settled yet. Delay gives the browser time to finish layout.
      const sizeTimer = setTimeout(() => { if (!cancelled) map.invalidateSize() }, 500)

      const onResize = () => map.invalidateSize()
      window.addEventListener('resize', onResize)

      cleanupRef.current = () => {
        clearTimeout(sizeTimer)
        window.removeEventListener('resize', onResize)
        map.remove()
        mapInstance.current = null
      }
    }

    tryInit()

    return () => {
      cancelled = true
      cleanupRef.current?.()
    }
  }, [])

  // Update markers when sites change
  useEffect(() => {
    const L = window.L
    const map = mapInstance.current
    if (!map || !L) return

    // Remove old markers
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    // Filter sites with valid coords
    const mapped = sites.filter(s => s.lat && s.lng)

    mapped.forEach(site => {
      const status = getSiteStatus(site)
      const color = STATUS_COLORS[status]
      const marker = L.marker([site.lat, site.lng], { icon: makeIcon(color) })

      marker.on('click', () => onSelect(site))

      // Tooltip for quick info on hover
      marker.bindTooltip(
        `<strong>${site.siteId || 'Site'}</strong><br>FUZE: ${site.fuzeId || '—'}<br>${site.city || ''} ${site.state || ''}`,
        { direction: 'top', offset: [0, -8] }
      )

      marker.addTo(map)
      markersRef.current.push(marker)
    })

    // Auto-fit bounds if there are mapped sites
    if (mapped.length > 0) {
      const bounds = L.latLngBounds(mapped.map(s => [s.lat, s.lng]))
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 })
    }
  }, [sites, onSelect])

  return <div ref={mapRef} className="map-container" />
}

import { useEffect, useRef, useState } from 'react'
import { colorForSite } from '../utils/mapColors'
import { tileLayerFor } from '../utils/mapLayers'
import { makeSiteIcon, quadcopterIcon } from '../utils/mapIcons'

// A site is flagged "refly" from either the office REFLY checkbox or the Map
// Color already saying so (see mapColors.js MAP_COLOR_NOT_DONE) — same check
// used in SiteList.jsx.
function isReflySite(site) {
  return !!site.refly || site.mapColor === 'Refly' || site.mapColor === 'Refly Further Coordination Required'
}

export default function MapView({ sites, onSelect, highlightedSiteId }) {
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const tileLayerRef = useRef(null)
  // Keyed by site id so the highlight effect below can find + restyle a
  // single marker without touching the rest (see markersRef.current).
  const markersRef = useRef(new Map())
  const highlightedRef = useRef(null) // site id currently drawn as highlighted, if any
  const locateMarkerRef = useRef(null)
  const [locating, setLocating] = useState(false)
  const [locateError, setLocateError] = useState(null)
  const [locationVisible, setLocationVisible] = useState(false)
  const [satellite, setSatellite] = useState(false)

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

    mapInstance.current = map

    return () => {
      map.remove()
      mapInstance.current = null
    }
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

  // Restyles the previously-highlighted marker back to normal and the newly
  // highlighted one to the amber-ring icon with its tooltip pinned open.
  // Called both after a marker rebuild (to re-apply the current highlight to
  // the fresh marker objects) and whenever `highlightedSiteId` itself
  // changes — deliberately NOT a map-rebuild trigger on its own, so tapping
  // a pin never re-fits/re-centers the map.
  function applyHighlight(id) {
    const prevId = highlightedRef.current
    if (prevId && prevId !== id) {
      const prevEntry = markersRef.current.get(prevId)
      if (prevEntry) {
        prevEntry.marker.setIcon(prevEntry.baseIcon)
        prevEntry.marker.unbindTooltip()
        prevEntry.marker.bindTooltip(prevEntry.tooltipHtml, { direction: 'top', offset: [0, -8] })
      }
    }
    if (id) {
      const entry = markersRef.current.get(id)
      if (entry) {
        entry.marker.setIcon(entry.highlightIcon)
        entry.marker.unbindTooltip()
        entry.marker.bindTooltip(entry.tooltipHtml, { direction: 'top', offset: [0, -8], permanent: true })
        entry.marker.openTooltip()
      }
    }
    highlightedRef.current = id
  }

  // Update markers when sites change
  useEffect(() => {
    const L = window.L
    const map = mapInstance.current
    if (!map || !L) return

    markersRef.current.forEach(({ marker }) => marker.remove())
    markersRef.current = new Map()
    highlightedRef.current = null

    const mapped = sites.filter(s => s.lat && s.lng)

    mapped.forEach(site => {
      const color = colorForSite(site)
      const baseIcon = makeSiteIcon(color, site.pinIcon)
      const highlightIcon = makeSiteIcon(color, site.pinIcon, 24, true)
      const marker = L.marker([site.lat, site.lng], { icon: baseIcon })

      marker.on('click', () => onSelect(site))
      const reflyLine = isReflySite(site) && site.reflyNotes
        ? `<br><em>Refly: ${site.reflyNotes}</em>`
        : ''
      const tooltipHtml = `<strong>${site.siteId || 'Site'}</strong><br>FUZE: ${site.fuzeId || '—'}<br>${site.mapColor || ''}<br>${site.city || ''} ${site.state || ''}${reflyLine}`
      marker.bindTooltip(tooltipHtml, { direction: 'top', offset: [0, -8] })

      marker.addTo(map)
      markersRef.current.set(site.id, { marker, baseIcon, highlightIcon, tooltipHtml })
    })

    if (mapped.length > 0) {
      const bounds = L.latLngBounds(mapped.map(s => [s.lat, s.lng]))
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 })
    }

    // Re-apply the current highlight to the freshly-built markers (e.g. a
    // status sync refreshed `sites` while a pin was highlighted).
    applyHighlight(highlightedSiteId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sites, onSelect])

  // Highlight changes on their own — tapping a different pin — restyle just
  // the two affected markers without rebuilding the rest or moving the map.
  useEffect(() => {
    applyHighlight(highlightedSiteId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightedSiteId])

  function hideLocation() {
    if (locateMarkerRef.current) {
      locateMarkerRef.current.remove()
      locateMarkerRef.current = null
    }
    setLocationVisible(false)
  }

  // Toggle button: tap to show your location, tap again to hide it. The hide
  // side is the pilots' own escape hatch for when their location dot sits on
  // top of a site pin they need to tap — reported from the field: a pilot
  // couldn't mark a site because her own location marker was covering it.
  // This only affects this pilot's own Map tab — the Admin view's live pilot
  // markers are separate and keep showing regardless.
  function handleLocate() {
    if (locationVisible) {
      hideLocation()
      return
    }

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

        // Place quadcopter marker at current location
        const marker = L.marker([latitude, longitude], { icon: quadcopterIcon('#3b82f6'), zIndexOffset: 1000 })
        marker.bindTooltip('You are here', { permanent: false, direction: 'top', offset: [0, -8] })
        marker.addTo(map)
        locateMarkerRef.current = marker

        // Pan to location at a reasonable zoom
        map.setView([latitude, longitude], Math.max(map.getZoom(), 13))
        setLocating(false)
        setLocationVisible(true)
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
        className={`map-layer-btn with-locate${satellite ? ' active' : ''}`}
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
      <button
        className={`map-locate-btn${locating ? ' locating' : ''}${locationVisible ? ' active' : ''}`}
        onClick={handleLocate}
        title={locationVisible ? 'Hide my location' : 'Show my location'}
        aria-label={locationVisible ? 'Hide my location on the map' : 'Show my location on the map'}
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

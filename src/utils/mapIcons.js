// Shared Leaflet icon builders used by MapView.jsx (pilot's own map + "You are
// here" marker) and AdminView.jsx (live pilot location markers), so the
// quadcopter shape stays visually identical everywhere it appears.

// A simple top-down quadcopter silhouette: four rotor circles on diagonal arms
// around a center body, tinted by `color`.
export function quadcopterIcon(color, size = 30) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 30 30">
    <line x1="6" y1="6" x2="24" y2="24" stroke="${color}" stroke-width="2.5"/>
    <line x1="24" y1="6" x2="6" y2="24" stroke="${color}" stroke-width="2.5"/>
    <circle cx="6" cy="6" r="4" fill="${color}" fill-opacity="0.85" stroke="white" stroke-width="1.5"/>
    <circle cx="24" cy="6" r="4" fill="${color}" fill-opacity="0.85" stroke="white" stroke-width="1.5"/>
    <circle cx="6" cy="24" r="4" fill="${color}" fill-opacity="0.85" stroke="white" stroke-width="1.5"/>
    <circle cx="24" cy="24" r="4" fill="${color}" fill-opacity="0.85" stroke="white" stroke-width="1.5"/>
    <circle cx="15" cy="15" r="5.5" fill="${color}" stroke="white" stroke-width="2"/>
  </svg>`
  const url = `data:image/svg+xml;base64,${btoa(svg)}`
  return window.L.icon({
    iconUrl: url,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  })
}

// Site pin shapes a pilot can pick per-site from SiteDetail's icon picker,
// synced via the Airtable "App Pin Icon" field (api/_airtable.js FIELDS.PIN_ICON).
// Still tinted by the site's status color — the shape is an extra display
// dimension, not a replacement for it.
export function siteIconSvg(color, iconType) {
  switch (iconType) {
    case 'building':
      return `<rect x="4" y="3" width="16" height="19" rx="2" fill="${color}" stroke="white" stroke-width="2"/>
        <rect x="7" y="7" width="3" height="3" fill="white"/>
        <rect x="14" y="7" width="3" height="3" fill="white"/>
        <rect x="7" y="12" width="3" height="3" fill="white"/>
        <rect x="14" y="12" width="3" height="3" fill="white"/>
        <rect x="9.5" y="17" width="5" height="5" fill="white"/>`
    case 'tower':
      return `<polygon points="12,2 17,22 13.5,22 12,12 10.5,22 7,22" fill="${color}" stroke="white" stroke-width="1.5"/>
        <line x1="8.5" y1="14" x2="15.5" y2="14" stroke="white" stroke-width="1"/>`
    case 'sba':
    case 'coa':
    case 'laanc':
      return `<rect x="1" y="6" width="22" height="12" rx="4" fill="${color}" stroke="white" stroke-width="2"/>
        <text x="12" y="15" font-size="7" font-weight="700" fill="white" text-anchor="middle" font-family="sans-serif">${iconType.toUpperCase()}</text>`
    default:
      return `<circle cx="12" cy="12" r="10" fill="${color}" stroke="white" stroke-width="2"/>`
  }
}

export function makeSiteIcon(color, iconType, size = 24) {
  // The shaped pins (building/tower/sba/coa/laanc) render a bit small next to
  // the default status dot at the same nominal size, so bump them up ~35% —
  // the plain dot (no iconType) stays at the base size passed in.
  const renderSize = iconType ? Math.round(size * 1.35) : size
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${renderSize}" height="${renderSize}" viewBox="0 0 24 24">${siteIconSvg(color, iconType)}</svg>`
  const url = `data:image/svg+xml;base64,${btoa(svg)}`
  return window.L.icon({
    iconUrl: url,
    iconSize: [renderSize, renderSize],
    iconAnchor: [renderSize / 2, renderSize / 2],
    popupAnchor: [0, -renderSize / 2],
  })
}

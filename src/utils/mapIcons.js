// Shared Leaflet icon builders used by MapView.jsx (pilot's own map + "You are
// here" marker) and AdminView.jsx (live pilot location markers), so the
// quadcopter shape stays visually identical everywhere it appears.

// A simple top-down quadcopter silhouette: four rotor circles on diagonal arms
// around a center body. Always black — pilots are told apart by the tooltip
// (name) and, on the Admin map, the color-coded chip strip, not the icon
// itself.
const DRONE_COLOR = '#000000'

export function quadcopterIcon(size = 30) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 30 30">
    <line x1="6" y1="6" x2="24" y2="24" stroke="${DRONE_COLOR}" stroke-width="2.5"/>
    <line x1="24" y1="6" x2="6" y2="24" stroke="${DRONE_COLOR}" stroke-width="2.5"/>
    <circle cx="6" cy="6" r="4" fill="${DRONE_COLOR}" fill-opacity="0.85" stroke="white" stroke-width="1.5"/>
    <circle cx="24" cy="6" r="4" fill="${DRONE_COLOR}" fill-opacity="0.85" stroke="white" stroke-width="1.5"/>
    <circle cx="6" cy="24" r="4" fill="${DRONE_COLOR}" fill-opacity="0.85" stroke="white" stroke-width="1.5"/>
    <circle cx="24" cy="24" r="4" fill="${DRONE_COLOR}" fill-opacity="0.85" stroke="white" stroke-width="1.5"/>
    <circle cx="15" cy="15" r="5.5" fill="${DRONE_COLOR}" stroke="white" stroke-width="2"/>
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
    case 'tower': {
      // Lattice/self-support tower silhouette — tapering truss legs with
      // X-bracing at three levels, topped with a small aviation beacon light
      // (matches real-world "Self Support (Lattice Tower)" structure types).
      // Each segment is drawn twice: a white halo first for contrast against
      // any map tile color, then the status color on top — same visual
      // weight as the filled+white-outline building/SBA/COA/LAANC icons.
      const segments = [
        [4, 22, 10, 2, 2],          // left leg
        [20, 22, 14, 2, 2],         // right leg
        [6.2, 16, 17.8, 16, 1.4],   // lower cross bar
        [7.6, 10.5, 16.4, 10.5, 1.4], // upper cross bar
        [10, 2, 14, 2, 1.4],        // top bar
        [4, 22, 17.8, 16, 0.9],     // brace ↗
        [20, 22, 6.2, 16, 0.9],     // brace ↖
        [6.2, 16, 16.4, 10.5, 0.9], // brace ↗
        [17.8, 16, 7.6, 10.5, 0.9], // brace ↖
        [7.6, 10.5, 14, 2, 0.9],    // brace ↗
        [16.4, 10.5, 10, 2, 0.9],   // brace ↖
      ]
      const line = (x1, y1, x2, y2, w, stroke) =>
        `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round"/>`
      const halo = segments.map(([x1, y1, x2, y2, w]) => line(x1, y1, x2, y2, w + 1.6, 'white')).join('')
      const truss = segments.map(([x1, y1, x2, y2, w]) => line(x1, y1, x2, y2, w, color)).join('')
      return `${halo}${truss}<circle cx="12" cy="1" r="1.3" fill="white" stroke="${color}" stroke-width="1"/>`
    }
    case 'sba':
    case 'coa':
    case 'laanc':
      return `<rect x="1" y="6" width="22" height="12" rx="4" fill="${color}" stroke="white" stroke-width="2"/>
        <text x="12" y="15" font-size="7" font-weight="700" fill="white" text-anchor="middle" font-family="sans-serif">${iconType.toUpperCase()}</text>`
    default:
      return `<circle cx="12" cy="12" r="10" fill="${color}" stroke="white" stroke-width="2"/>`
  }
}

// `highlighted` draws an amber ring around the pin — used by MapView to mark
// the site the pilot most recently tapped, so it stays visually findable
// after they close its detail sheet. The ring lives outside the pin's own
// 0-24 coordinate space, so highlighted icons render on a wider 30x30
// viewBox (content stays centered) rather than resizing the pin itself.
export function makeSiteIcon(color, iconType, size = 24, highlighted = false) {
  // The shaped pins (building/tower/sba/coa/laanc) render a bit small next to
  // the default status dot at the same nominal size, so bump them up ~35% —
  // the plain dot (no iconType) stays at the base size passed in.
  const renderSize = iconType ? Math.round(size * 1.35) : size
  const boxSize = highlighted ? Math.round(renderSize * 30 / 24) : renderSize
  const viewBox = highlighted ? '-3 -3 30 30' : '0 0 24 24'
  const ring = highlighted
    ? '<circle cx="12" cy="12" r="12.5" fill="none" stroke="#fbbf24" stroke-width="2.5"/>'
    : ''
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${boxSize}" height="${boxSize}" viewBox="${viewBox}">${ring}${siteIconSvg(color, iconType)}</svg>`
  const url = `data:image/svg+xml;base64,${btoa(svg)}`
  return window.L.icon({
    iconUrl: url,
    iconSize: [boxSize, boxSize],
    iconAnchor: [boxSize / 2, boxSize / 2],
    popupAnchor: [0, -boxSize / 2],
  })
}

// Sun "shadow" overlay for the Admin map — shades the map where the sun is a
// problem for LEVEL-gimbal (0 deg) collections at a chosen time of day.
//
// Why: crews orbit towers with a level-ish camera, so whenever the sun is low
// (or only just above the top edge of the frame) it ends up in the photos or
// washes them out. This paints that picture across the whole map so an admin
// can see at a glance which regions are bad right now, and scrub through the
// day to see how the bad band moves east to west.
//
// What each color means at the chosen time (Mavic 3E wide camera, level):
//   red    — sun in the camera's vertical field of view (elevation < 29 deg)
//   amber  — flare risk, sun just above the frame (29-39 deg)
//   gray   — outside the collection window (sunrise + 2 hrs to sunset - 2 hrs)
//   (none) — clear: the sun is high enough to be out of the picture
//
// Sun position math matches SunGlareCheck.jsx (NOAA-style, good to a fraction
// of a degree). Per tile, only one sun lookup is needed — the sun's
// declination and sidereal time are the same everywhere — and everything
// per-pixel is just compares, so scrubbing the time slider stays smooth.
//
// Rendered as a Leaflet GridLayer (canvas tiles) using the same window.L
// global the rest of the map code uses; returns null if Leaflet isn't loaded
// yet, same graceful-degradation pattern as createAirspaceLayer().

import { centralDateStr, formatCentralTime } from './centralTime'

const RAD = Math.PI / 180
const J2000_MS = Date.UTC(2000, 0, 1, 12)

// Level gimbal only (this overlay's whole purpose).
const HALF_V = 29 // deg, half of the Mavic 3E wide camera's vertical FOV
const FLARE_MARGIN = 10 // deg above the frame edge that can still flare
const BUFFER_MIN = 120 // collection window: sunrise + 2 hrs ... sunset - 2 hrs
const SUNRISE_EL = -0.833 // standard sunrise/sunset altitude

const SIN_FRAME = Math.sin(HALF_V * RAD)
const SIN_FLARE = Math.sin((HALF_V + FLARE_MARGIN) * RAD)
const BUFFER_DEG = (BUFFER_MIN / 60) * 15 // hour-angle degrees the sun moves in the buffer

const FILL = {
  out: 'rgba(15, 23, 42, 0.42)',
  frame: 'rgba(239, 68, 68, 0.38)',
  flare: 'rgba(245, 158, 11, 0.32)',
}

// `swatch` is a solid version of each fill so the legend dots read clearly on
// the dark panel (the map fills themselves are translucent).
export const SUN_SHADOW_LEGEND = [
  { key: 'frame', label: 'Sun in frame (level gimbal)', swatch: '#ef4444' },
  { key: 'flare', label: 'Flare risk', swatch: '#f59e0b' },
  { key: 'out', label: 'Outside collection window', swatch: '#475569' },
]

// ── Time helpers (everything is pinned to Central, like the rest of the app) ─

export const SUN_SLIDER_MIN = 300 // 5:00 AM CT
export const SUN_SLIDER_MAX = 1430 // 11:50 PM CT
export const SUN_SLIDER_STEP = 10

function centralOffsetHours(ms) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(ms))
  const o = {}
  parts.forEach(p => { o[p.type] = p.value })
  const asUtc = Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour, +o.minute, +o.second)
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 3600000)
}

// Epoch ms of midnight at the start of today's Central calendar day.
export function centralDayStartMs(date = new Date()) {
  const [y, m, d] = centralDateStr(date).split('-').map(Number)
  const offsetHours = centralOffsetHours(Date.UTC(y, m - 1, d, 18))
  return Date.UTC(y, m - 1, d) - offsetHours * 3600000
}

// Minutes since Central midnight, snapped to the slider step and clamped.
export function clampSunMinute(min) {
  const snapped = Math.round(min / SUN_SLIDER_STEP) * SUN_SLIDER_STEP
  return Math.min(Math.max(snapped, SUN_SLIDER_MIN), SUN_SLIDER_MAX)
}

export function currentSunMinute(date = new Date()) {
  return clampSunMinute((date.getTime() - centralDayStartMs(date)) / 60000)
}

export function sunMinuteLabel(min, date = new Date()) {
  return formatCentralTime(new Date(centralDayStartMs(date) + min * 60000))
}

// ── Sun terms (computed once per time, shared by every pixel) ────────────────

function sunTermsAt(ms) {
  const n = (ms - J2000_MS) / 86400000
  const g = ((357.528 + 0.9856003 * n) % 360) * RAD
  const L = (280.46 + 0.9856474 * n) % 360
  const lam = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD
  const eps = (23.439 - 0.0000004 * n) * RAD
  const raDeg = (Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam)) / RAD + 360) % 360
  const dec = Math.asin(Math.sin(eps) * Math.sin(lam))
  const gmstDeg = ((18.697374558 + 24.06570982441908 * n) % 24) * 15
  return {
    sinDec: Math.sin(dec),
    cosDec: Math.cos(dec),
    lstBaseDeg: gmstDeg - raDeg, // add longitude (deg) to get the sun's hour angle
  }
}

const sunHourAngle = (terms, lngDeg) => {
  // Hour angle in degrees, normalized to [-180, 180).
  const x = terms.lstBaseDeg + lngDeg
  return ((((x + 180) % 360) + 360) % 360) - 180
}

// 'out' | 'frame' | 'flare' | 'clear' for one point, at the time `terms` was
// built for. Exported so site-level views can reuse the exact same rule.
export function sunStatusAt(lat, lng, terms) {
  const phi = lat * RAD
  const sinPhi = Math.sin(phi)
  const cosPhi = Math.cos(phi)
  const H = sunHourAngle(terms, lng)
  return classify(sinPhi, cosPhi, H, Math.cos(H * RAD), terms)
}

function classify(sinPhi, cosPhi, hDeg, cosH, terms) {
  // Half-length of daylight (hour angle at sunrise) for this latitude today,
  // minus the 2-hour buffers on each end.
  const cosW0 = (Math.sin(SUNRISE_EL * RAD) - sinPhi * terms.sinDec) / (cosPhi * terms.cosDec)
  const w0 = Math.acos(Math.min(1, Math.max(-1, cosW0))) / RAD
  if (Math.abs(hDeg) >= w0 - BUFFER_DEG) return 'out'
  const sinEl = sinPhi * terms.sinDec + cosPhi * terms.cosDec * cosH
  if (sinEl < SIN_FRAME) return 'frame'
  if (sinEl < SIN_FLARE) return 'flare'
  return 'clear'
}

// ── Leaflet layer ────────────────────────────────────────────────────────────

const CELL_PX = 4 // canvas cell size; small enough to look smooth, cheap to draw

// Creates (but does not add to the map) the overlay, pinned to `timeMs`.
// Move it to a new time with layer.setTime(ms). Returns null if Leaflet isn't
// loaded yet.
export function createSunShadowLayer(timeMs) {
  const L = window.L
  if (!L || !L.GridLayer) return null

  const SunShadow = L.GridLayer.extend({
    initialize(ms, options) {
      this._terms = sunTermsAt(ms)
      L.GridLayer.prototype.initialize.call(this, options)
    },

    setTime(ms) {
      this._terms = sunTermsAt(ms)
      this.redraw()
    },

    createTile(coords) {
      const size = this.getTileSize()
      const tile = document.createElement('canvas')
      tile.width = size.x
      tile.height = size.y
      const map = this._map
      if (!map) return tile
      const ctx = tile.getContext('2d')
      const terms = this._terms
      const cells = Math.ceil(size.x / CELL_PX)

      // Mercator: longitude depends only on the pixel column and latitude only
      // on the pixel row, so work them out once per column/row, not per cell.
      const cols = []
      for (let cx = 0; cx < cells; cx++) {
        const px = coords.x * size.x + cx * CELL_PX + CELL_PX / 2
        const lng = map.unproject([px, coords.y * size.y], coords.z).lng
        const h = sunHourAngle(terms, lng)
        cols.push({ h, cosH: Math.cos(h * RAD) })
      }
      for (let cy = 0; cy < cells; cy++) {
        const py = coords.y * size.y + cy * CELL_PX + CELL_PX / 2
        const lat = map.unproject([coords.x * size.x, py], coords.z).lat
        const phi = lat * RAD
        const sinPhi = Math.sin(phi)
        const cosPhi = Math.cos(phi)
        for (let cx = 0; cx < cells; cx++) {
          const c = cols[cx]
          const status = classify(sinPhi, cosPhi, c.h, c.cosH, terms)
          if (status === 'clear') continue
          ctx.fillStyle = FILL[status]
          ctx.fillRect(cx * CELL_PX, cy * CELL_PX, CELL_PX, CELL_PX)
        }
      }
      return tile
    },
  })

  // zIndex 5 keeps it above the base map tiles but below markers/popups.
  return new SunShadow(timeMs, { zIndex: 5, tileSize: 256, updateWhenZooming: false, keepBuffer: 2 })
}

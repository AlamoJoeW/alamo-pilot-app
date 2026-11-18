import { useState, useMemo, useEffect } from 'react'
import { sunTimesFor } from '../utils/routePlanner'
import { centralDateStr, formatCentralTime } from '../utils/centralTime'

// Admin-only sun / glare check for the Admin site detail sheet.
//
// Why: the crew orbits towers with a level-ish gimbal, so for part of every
// orbit the camera looks toward the sun. This answers "when, and on which
// side of the tower, will the sun be in the photos?" for a given site, date
// and gimbal pitch, limited to the collection window (sunrise + 2 hrs to
// sunset - 2 hrs).
//
// Not wired into the pilot-facing SiteDetail on purpose — it is only rendered
// from AdminSiteDetail (reachable only when pilot.isAdmin) until Joe is happy
// with it.
//
// Camera model: DJI Mavic 3E wide camera, 4:3 photos, ~84 deg diagonal FOV
// -> about +/-36 deg horizontal and +/-29 deg vertical from the frame center.
// "Flare risk" adds a 10 deg margin around the frame, since a bright sun just
// outside the frame can still wash out the shot.
//
// Sun position uses a compact NOAA-style solar position calc (good to a
// fraction of a degree). Sunrise/sunset reuse sunTimesFor() from
// routePlanner.js so the window matches the Route tab's math.

const HALF_H = 36 // deg, half of horizontal FOV
const HALF_V = 29 // deg, half of vertical FOV
const FLARE_MARGIN = 10 // deg beyond the frame edge that can still flare
const PAD_MIN = 120 // minutes after sunrise / before sunset
const STEP_MIN = 5 // timeline resolution
const SUN_VISIBLE_EL = -0.833 // below this the sun is below the horizon

const COLORS = { frame: '#ef4444', flare: '#f59e0b', clear: '#22c55e' }
const LABELS = { frame: 'Sun in frame', flare: 'Flare risk', clear: 'Clear' }
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
const PITCH_OPTIONS = [
  { value: 0, label: 'Level (0°)' },
  { value: -15, label: 'Down 15°' },
  { value: -30, label: 'Down 30°' },
]

const RAD = Math.PI / 180
const J2000_MS = Date.UTC(2000, 0, 1, 12)

function solarPosition(date, lat, lng) {
  const n = (date.getTime() - J2000_MS) / 86400000
  const g = ((357.528 + 0.9856003 * n) % 360) * RAD
  const L = (280.46 + 0.9856474 * n) % 360
  const lam = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD
  const eps = (23.439 - 0.0000004 * n) * RAD
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam))
  const dec = Math.asin(Math.sin(eps) * Math.sin(lam))
  const gmstHours = (18.697374558 + 24.06570982441908 * n) % 24
  const H = ((((gmstHours * 15 + lng) % 360) + 360) % 360) * RAD - ra
  const phi = lat * RAD
  const el =
    Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H)) / RAD
  const az =
    (Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(phi) - Math.sin(phi) * Math.cos(H)) / RAD + 360) %
    360
  return { el, az }
}

// 'frame' = sun inside the picture, 'flare' = just outside it, 'clear' = fine.
function statusFor(el, pitch) {
  if (el < SUN_VISIBLE_EL) return 'clear'
  if (el > pitch - HALF_V && el < pitch + HALF_V) return 'frame'
  if (el > pitch - HALF_V - FLARE_MARGIN && el < pitch + HALF_V + FLARE_MARGIN) return 'flare'
  return 'clear'
}

const compassName = bearing => COMPASS[Math.round((((bearing % 360) + 360) % 360) / 45) % 8]

// Clock label like "9:10 AM" (Central, same convention as the rest of the app).
const clock = ms => formatCentralTime(new Date(ms)).replace(' CT', '')

function bearingPoint(cx, cy, r, bearing) {
  const a = bearing * RAD
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)]
}

function arcPath(cx, cy, r, b1, b2) {
  const [x1, y1] = bearingPoint(cx, cy, r, b1)
  const [x2, y2] = bearingPoint(cx, cy, r, b2)
  return `M${x1.toFixed(1)} ${y1.toFixed(1)} A${r} ${r} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`
}

export default function SunGlareCheck({ site }) {
  const [open, setOpen] = useState(false)
  const [dateStr, setDateStr] = useState(() => centralDateStr())
  const [pitch, setPitch] = useState(0)
  const [selIdx, setSelIdx] = useState(null) // null = start of collection window

  // Fresh state whenever the admin opens a different site's sheet.
  useEffect(() => {
    setOpen(false)
    setDateStr(centralDateStr())
    setSelIdx(null)
  }, [site.id])

  useEffect(() => {
    setSelIdx(null)
  }, [dateStr])

  const hasPos = site.lat != null && site.lng != null && site.lat !== '' && site.lng !== ''

  const model = useMemo(() => {
    if (!hasPos || !open) return null
    const lat = Number(site.lat)
    const lng = Number(site.lng)
    const [y, m, d] = dateStr.split('-').map(Number)
    if (!y || !m || !d || Number.isNaN(lat) || Number.isNaN(lng)) return null
    // 18:00 UTC is midday across the continental US, so sunTimesFor() lands
    // on the right local day's sunrise/sunset.
    const { sunrise, sunset } = sunTimesFor(new Date(Date.UTC(y, m - 1, d, 18)), lat, lng)
    if (Number.isNaN(sunrise.getTime()) || Number.isNaN(sunset.getTime())) return null
    const opsStart = sunrise.getTime() + PAD_MIN * 60000
    const opsEnd = sunset.getTime() - PAD_MIN * 60000
    const t0 = sunrise.getTime() - 60 * 60000
    const t1 = sunset.getTime() + 60 * 60000
    const count = Math.floor((t1 - t0) / (STEP_MIN * 60000))
    const samples = []
    for (let i = 0; i <= count; i++) {
      const t = t0 + i * STEP_MIN * 60000
      samples.push({ t, ...solarPosition(new Date(t), lat, lng) })
    }
    return { sunrise: sunrise.getTime(), sunset: sunset.getTime(), opsStart, opsEnd, t0, t1, count, samples }
  }, [hasPos, open, site.lat, site.lng, dateStr])

  if (!hasPos) return null

  if (!open) {
    return (
      <div className="weather-row">
        <button type="button" className="weather-check-btn" onClick={() => setOpen(true)}>
          Sun &amp; glare check (admin)
        </button>
      </div>
    )
  }

  if (!model) {
    return (
      <div className="weather-row">
        <div className="weather-error">
          <span>Couldn&apos;t work out the sun for this site and date.</span>
          <button type="button" className="weather-retry-btn" onClick={() => setOpen(false)}>Close</button>
        </div>
      </div>
    )
  }

  const { samples, opsStart, opsEnd, t0, t1, count } = model
  const idx =
    selIdx != null
      ? Math.min(Math.max(selIdx, 0), count)
      : Math.min(Math.max(Math.round((opsStart - t0) / (STEP_MIN * 60000)), 0), count)
  const cur = samples[idx]
  const curStatus = statusFor(cur.el, pitch)
  const curInWindow = cur.t >= opsStart && cur.t <= opsEnd

  // Summary over the collection window only.
  let best = null
  let run = null
  let frameMin = 0
  let flareMin = 0
  let totalMin = 0
  for (const s of samples) {
    if (s.t < opsStart || s.t > opsEnd) continue
    totalMin += STEP_MIN
    const k = statusFor(s.el, pitch)
    if (k === 'frame') frameMin += STEP_MIN
    if (k === 'flare') flareMin += STEP_MIN
    if (k === 'clear') {
      if (!run) run = { start: s.t, end: s.t }
      run.end = s.t
      if (!best || run.end - run.start > best.end - best.start) best = { ...run }
    } else {
      run = null
    }
  }

  // Timeline geometry.
  const X0 = 10
  const X1 = 390
  const sx = t => X0 + ((t - t0) / (t1 - t0)) * (X1 - X0)
  const stepW = ((X1 - X0) / (t1 - t0)) * STEP_MIN * 60000 + 0.6

  // Dial geometry.
  const CX = 150
  const CY = 150
  const R = 88
  const sunVisible = cur.el > SUN_VISIBLE_EL
  const avoidCenter = cur.az + 180 // drone position on the orbit when the camera faces the sun

  return (
    <div className="weather-row sun-panel">
      <div className="sun-head">
        <span className="sun-title">Sun &amp; glare check</span>
        <span className="sun-tag">Admin preview</span>
        <button type="button" className="weather-refresh-btn" onClick={() => setOpen(false)} title="Close">✕</button>
      </div>

      <div className="sun-controls">
        <label className="sun-field">
          <span>Date</span>
          <input
            type="date"
            value={dateStr}
            onChange={e => e.target.value && setDateStr(e.target.value)}
          />
        </label>
        <label className="sun-field">
          <span>Gimbal pitch</span>
          <select value={pitch} onChange={e => setPitch(Number(e.target.value))}>
            {PITCH_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="sun-window-line">
        Sunrise {clock(model.sunrise)} · Window {clock(opsStart)}–{clock(opsEnd)} · Sunset {clock(model.sunset)} CT
      </div>

      <div className="sun-slider-row">
        <input
          type="range"
          min={0}
          max={count}
          step={1}
          value={idx}
          onChange={e => setSelIdx(Number(e.target.value))}
          aria-label="Time of day"
        />
        <span className="sun-time">{clock(cur.t)}</span>
      </div>

      <div className="sun-cards">
        <div className="sun-card">
          <div className="sun-k">Sun az / elev</div>
          <div className="sun-v">{Math.round(cur.az)}° / {Math.round(cur.el)}°</div>
        </div>
        <div className="sun-card">
          <div className="sun-k">Camera</div>
          <div className="sun-v" style={{ color: COLORS[curStatus] }}>
            {LABELS[curStatus]}
          </div>
          {!curInWindow && <div className="sun-k">outside window</div>}
        </div>
        <div className="sun-card">
          <div className="sun-k">Avoid drone on</div>
          <div className="sun-v">{curStatus === 'clear' ? 'None' : `${compassName(avoidCenter)} side`}</div>
        </div>
      </div>

      <svg viewBox="0 0 300 300" className="sun-dial" role="img" aria-label="Orbit compass dial with the sun-in-frame arc highlighted">
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--border)" strokeWidth="1.5" />
        {curStatus !== 'clear' && (
          <>
            <path d={arcPath(CX, CY, R, avoidCenter - HALF_H - FLARE_MARGIN, avoidCenter + HALF_H + FLARE_MARGIN)} fill="none" stroke={COLORS.flare} strokeWidth="10" opacity="0.55" />
            {curStatus === 'frame' && (
              <path d={arcPath(CX, CY, R, avoidCenter - HALF_H, avoidCenter + HALF_H)} fill="none" stroke={COLORS.frame} strokeWidth="10" />
            )}
          </>
        )}
        <circle cx={CX} cy={CY} r="5" fill="var(--text)" />
        <text x={CX} y={CY + 22} textAnchor="middle" fontSize="12" fill="var(--text2)">Tower</text>
        {[['N', 0], ['E', 90], ['S', 180], ['W', 270]].map(([t, b]) => {
          const [x, y] = bearingPoint(CX, CY, 134, b)
          return (
            <text key={t} x={x.toFixed(1)} y={(y + 4).toFixed(1)} textAnchor="middle" fontSize="12" fill="var(--text2)">{t}</text>
          )
        })}
        {sunVisible && (() => {
          const [sx1, sy1] = bearingPoint(CX, CY, 114, cur.az)
          const [sx2, sy2] = bearingPoint(CX, CY, R - 10, cur.az)
          return (
            <>
              <line x1={sx1.toFixed(1)} y1={sy1.toFixed(1)} x2={sx2.toFixed(1)} y2={sy2.toFixed(1)} stroke="#f59e0b" strokeWidth="1" strokeDasharray="3 3" />
              <circle cx={sx1.toFixed(1)} cy={sy1.toFixed(1)} r="8" fill="#fde68a" stroke="#d97706" strokeWidth="1" />
            </>
          )
        })()}
      </svg>

      <svg viewBox="0 0 400 100" className="sun-timeline" role="img" aria-label="Day timeline colored by sun status">
        {samples.map(s => {
          const inWin = s.t >= opsStart && s.t <= opsEnd
          return (
            <rect
              key={s.t}
              x={sx(s.t).toFixed(2)}
              y="30"
              width={stepW.toFixed(2)}
              height="28"
              fill={inWin ? COLORS[statusFor(s.el, pitch)] : 'var(--border)'}
              opacity={inWin ? 1 : 0.5}
            />
          )
        })}
        {[opsStart, opsEnd].map(t => (
          <line key={t} x1={sx(t).toFixed(1)} y1="24" x2={sx(t).toFixed(1)} y2="64" stroke="var(--text)" strokeWidth="1" />
        ))}
        <text x={Math.max(sx(opsStart), 30).toFixed(1)} y="16" textAnchor="middle" fontSize="11" fill="var(--text2)">{clock(opsStart)}</text>
        <text x={Math.min(sx(opsEnd), 370).toFixed(1)} y="16" textAnchor="middle" fontSize="11" fill="var(--text2)">{clock(opsEnd)}</text>
        <text x={((sx(opsStart) + sx(opsEnd)) / 2).toFixed(1)} y="78" textAnchor="middle" fontSize="11" fill="var(--text2)">Collection window</text>
        <path d={`M${sx(cur.t).toFixed(1)} 26 l-5 -8 h10 z`} fill="var(--text)" />
        <line x1={sx(cur.t).toFixed(1)} y1="28" x2={sx(cur.t).toFixed(1)} y2="62" stroke="var(--text)" strokeWidth="2" />
      </svg>

      <div className="sun-legend">
        <span><i style={{ background: COLORS.frame }} />Sun in frame</span>
        <span><i style={{ background: COLORS.flare }} />Flare risk</span>
        <span><i style={{ background: COLORS.clear }} />Clear</span>
        <span><i style={{ background: 'var(--border)' }} />Outside window</span>
      </div>

      <div className="sun-summary">
        {totalMin === 0 ? (
          <div>No collection window on this date.</div>
        ) : (
          <>
            <div>
              {best
                ? `Longest clear stretch: ${clock(best.start)}–${clock(best.end + STEP_MIN * 60000)} CT`
                : 'No fully clear time in the collection window at this pitch.'}
            </div>
            <div>
              Sun in frame {frameMin} min · Flare risk {flareMin} min · of {totalMin} min window
            </div>
          </>
        )}
      </div>

      <div className="sun-note">
        Mavic 3E wide camera (about ±36° across, ±29° up/down), 10° flare margin. Sun only: trees, terrain and
        clouds aren&apos;t considered. Times shown in Central. When the sun is in frame, the drone is on the
        opposite side of the tower looking back toward it.
      </div>
    </div>
  )
}

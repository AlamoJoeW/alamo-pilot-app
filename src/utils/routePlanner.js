/**
 * routePlanner.js
 *
 * Client-side port of the pilot-daily-schedule skill's routing math, so a
 * pilot can generate their own route in-app (Route tab) instead of waiting
 * on the office to run the skill each morning. Same algorithm, same
 * constants — nearest-neighbor routing, sunrise+90/sunset-90 ops window,
 * 80 min/site, haversine x road-factor drive-time estimate — just running
 * in the browser against whatever sites the pilot actually checked off.
 *
 * No external dependency for sunrise/sunset — the calc below is a compact,
 * self-contained implementation of the standard public-domain solar
 * position formulas (same family of math libraries like `suncalc` use).
 * Accurate to within a minute or two, which is plenty given the 90-minute
 * padding applied on both ends of the window.
 */

// ── Distance & drive time ────────────────────────────────────────────────────

export function haversineMiles(lat1, lng1, lat2, lng2) {
  const R = 3959 // Earth radius, miles
  const toRad = d => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

// Matches the skill's road_minutes(): straight-line distance x a road-windiness
// factor, at an assumed average speed — both tuned by leg distance.
export function driveEstimate(lat1, lng1, lat2, lng2) {
  const miles = haversineMiles(lat1, lng1, lat2, lng2)
  const factor = miles > 50 ? 1.25 : 1.4
  const speed = miles > 80 ? 65 : 55
  const roadMiles = miles * factor
  return { minutes: (roadMiles / speed) * 60, miles: roadMiles }
}

// ── Sunrise / sunset ──────────────────────────────────────────────────────────

const DAY_MS = 1000 * 60 * 60 * 24
const J1970 = 2440588
const J2000 = 2451545
const RAD = Math.PI / 180
const OBLIQUITY = RAD * 23.4397

const toJulian = date => date.valueOf() / DAY_MS - 0.5 + J1970
const fromJulian = j => new Date((j + 0.5 - J1970) * DAY_MS)
const toDays = date => toJulian(date) - J2000

function solarMeanAnomaly(d) {
  return RAD * (357.5291 + 0.98560028 * d)
}
function eclipticLongitude(M) {
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M))
  const P = RAD * 102.9372
  return M + C + P + Math.PI
}
function declination(l) {
  return Math.asin(Math.sin(l) * Math.sin(OBLIQUITY))
}
function julianCycle(d, lw) {
  return Math.round(d - 0.0009 - lw / (2 * Math.PI))
}
function approxTransit(Ht, lw, n) {
  return 0.0009 + (Ht + lw) / (2 * Math.PI) + n
}
function solarTransitJ(ds, M, L) {
  return J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L)
}
function hourAngle(h, phi, d) {
  return Math.acos((Math.sin(h) - Math.sin(phi) * Math.sin(d)) / (Math.cos(phi) * Math.cos(d)))
}

// Real sunrise/sunset Date objects for the given calendar date + lat/lng.
// Date objects are timezone-agnostic (they represent a real instant), so this
// works correctly no matter what timezone the pilot's phone is in — no
// per-pilot IANA timezone table needed, unlike the Python skill.
export function sunTimesFor(date, lat, lng) {
  const lw = RAD * -lng
  const phi = RAD * lat
  const d = toDays(date)
  const n = julianCycle(d, lw)
  const ds = approxTransit(0, lw, n)
  const M = solarMeanAnomaly(ds)
  const L = eclipticLongitude(M)
  const dec = declination(L)
  const Jnoon = solarTransitJ(ds, M, L)
  const h0 = -0.833 * RAD // standard sunrise/sunset altitude (refraction + solar radius)
  const w = hourAngle(h0, phi, dec)
  const a = approxTransit(w, lw, n)
  const Jset = solarTransitJ(a, M, L)
  const Jrise = Jnoon - (Jset - Jnoon)
  return { sunrise: fromJulian(Jrise), sunset: fromJulian(Jset) }
}

// Sunrise+90 -> Sunset-90, same padding the skill uses.
export function opsWindowFor(date, lat, lng, paddingMin = 90) {
  const { sunrise, sunset } = sunTimesFor(date, lat, lng)
  return {
    sunrise,
    sunset,
    opsStart: new Date(sunrise.getTime() + paddingMin * 60000),
    opsEnd: new Date(sunset.getTime() - paddingMin * 60000),
  }
}

function formatClock(date) {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

// ── Routing ───────────────────────────────────────────────────────────────────

// Greedy nearest-neighbor from a starting point — same approach as the skill.
export function nearestNeighborOrder(startLat, startLng, sites) {
  const remaining = [...sites]
  const ordered = []
  let clat = startLat
  let clng = startLng
  while (remaining.length) {
    let bestIdx = 0
    let bestDist = Infinity
    remaining.forEach((s, i) => {
      const dist = haversineMiles(clat, clng, s.lat, s.lng)
      if (dist < bestDist) {
        bestDist = dist
        bestIdx = i
      }
    })
    const [next] = remaining.splice(bestIdx, 1)
    ordered.push(next)
    clat = next.lat
    clng = next.lng
  }
  return ordered
}

// Walks the nearest-neighbor order and fits as many stops as will finish
// within [opsStart, opsEnd], 80 min/site by default. Anything that wouldn't
// finish in time is returned separately as `leftover` rather than dropped.
//
// The schedule clock starts at max(opsStart, now) — not always opsStart —
// so replanning mid-morning or mid-afternoon (after already flying some
// sites) produces realistic arrival times instead of scheduling stops in
// the past.
export function scheduleStops(startLat, startLng, orderedSites, opsStart, opsEnd, durationMin = 80) {
  const scheduled = []
  const leftover = []
  let cur = new Date(Math.max(opsStart.getTime(), Date.now()))
  let clat = startLat
  let clng = startLng

  for (const site of orderedSites) {
    const { minutes: driveMin, miles: driveMi } = driveEstimate(clat, clng, site.lat, site.lng)
    const arrive = new Date(cur.getTime() + driveMin * 60000)
    const finish = new Date(arrive.getTime() + durationMin * 60000)

    if (finish <= opsEnd) {
      scheduled.push({
        recordId: site.id,
        siteId: site.siteId || '',
        address: site.address || '',
        city: site.city || '',
        state: site.state || '',
        lat: site.lat,
        lng: site.lng,
        mapColor: site.mapColor || '',
        order: scheduled.length + 1,
        scheduledArrival: formatClock(arrive),
        scheduledFinish: formatClock(finish),
        driveMinutes: Math.round(driveMin),
        driveMiles: Math.round(driveMi * 10) / 10,
      })
      cur = finish
      clat = site.lat
      clng = site.lng
    } else {
      leftover.push({
        recordId: site.id,
        siteId: site.siteId || '',
        address: site.address || '',
        city: site.city || '',
        state: site.state || '',
        lat: site.lat,
        lng: site.lng,
        mapColor: site.mapColor || '',
      })
    }
  }

  return { scheduled, leftover }
}

// Full pipeline: order the pilot's checked sites from their current position,
// then fit as many as possible into today's ops window.
export function buildRoutePlan({ sites, startLat, startLng, date = new Date() }) {
  const { opsStart, opsEnd, sunrise, sunset } = opsWindowFor(date, startLat, startLng)
  const ordered = nearestNeighborOrder(startLat, startLng, sites)
  const { scheduled, leftover } = scheduleStops(startLat, startLng, ordered, opsStart, opsEnd)
  return {
    stops: scheduled,
    leftover,
    opsStart,
    opsEnd,
    sunrise,
    sunset,
    generatedAt: new Date().toISOString(),
  }
}

// ── Pep talk ──────────────────────────────────────────────────────────────────

const PEP_TALK_LINES = [
  "Fly safe, fly fast — you've got this.",
  'Go put some points on the board.',
  "That's a solid day's work. Knock it out.",
  'Every stop today gets you closer to done.',
  'Blue skies and empty batteries by sundown.',
  'Make today count.',
  "Full send — you've got the route, now fly it.",
  'Small route, big progress. Go get it.',
  "One stop at a time. You've got the day handled.",
  'Batteries charged, route planned — go get it.',
  'Nothing but green pins by end of day.',
  "That's the plan. Now go fly it.",
]

export function pepTalkFor(stopCount) {
  if (stopCount <= 0) {
    return "Nothing fit the window this time — regroup and replan when you're ready."
  }
  const phrase = PEP_TALK_LINES[Math.floor(Math.random() * PEP_TALK_LINES.length)]
  const siteWord = stopCount === 1 ? 'site' : 'sites'
  return `${stopCount} ${siteWord} on today's route — ${phrase}`
}

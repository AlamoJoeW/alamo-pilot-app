import jwt from 'jsonwebtoken'
import { airtableGet, airtablePost, airtablePatch, airtableGetAll, centralDateStr } from './_airtable.js'

export const config = { api: { bodyParser: { sizeLimit: '10mb' } } }

const PREFLIGHT_TABLE = 'tbl3XS1n9edeDuLOn'

const F = {
  DATE:           'fld3e4DOx5yYCgbYe',
  PILOT:          'fldiapaRvwWUjBC4x',
  PROJECT:        'fldH8N230tZWXxxZr',
  TRAVEL_DAY:     'fldkUrdlnzkuw8ML5',
  TRAVELING_TO:   'fldQEK9X7oGDodpGv',
  VISUAL_OBS:     'fldq9cdjr2Xka4gNU',
  AIRCRAFT:       'fldXJPP7MDKEaLSCV',
  ACRES:          'flde2vhvTKKRjxAf2',
  BASIN:          'fldavOCL4taDWbKjr',
  FLIGHT_ADDR:    'fldWaWcaL4NOJcdnP',
  HOSPITAL:       'fldW4Ofn8HB5QDwon',
  IMSAFE:         'fldkfoTxuuvdDcfBB',
  WEATHER_CHK:    'fldtG4CncB7BPB0Kc',
  WEATHER_FCST:   'flda4qHgaJR1Zu7A3',
  AIRWORTHY:      'fld40658xFfOJ8CFn',
  AIRWORTHY_N:    'fldM9piS7h91ZgBtP',
  AIRSPACE:       'fldjlqeEuvawTW4Y3',
  TFR:            'fldVH0r0hjgPIJneE',
  LAANC_REQ:      'fldlMlZKaYnNcUR1J',
  CREW_REST:      'fldn4FW0OroiL214h',
  CREW_DAYS:      'fld6zYpJ9uxACJxvq',
  CREW_WORK:      'fld7KAF09V0j2lbb7',
  WX_WIND:        'fldlMLvrVa6QbAWoP',
  WX_VIS:         'fldI8QV1OIpbzAukx',
  WX_CEIL:        'fldmFj1nQ0e7DXVUT',
  WX_RAIN:        'fldjlZXJQpCCKub7n',
  WX_TEMP:        'fldT2VZ7fECRALv19',
  WX_TSTORM:      'fldDZPynJrcqmsoMB',
  RISK_TOTAL:     'fldlIeYxPDF6fkOqv',
  ADD_RISKS:      'fld69iUTWmrmVfLxw',
  MITIGATING:     'fldHYjSRFoMTVH24A',
  MISSION_OVW:    'fld2u2SXsljOi1L8l',
  GO_NOGO:        'fldlVErGgP1IJAoLp',
  NOTES:          'fldY4gVkWEfEhZgFV',
  EMERG_CONTACT:  'fldpvClkZS1S30rZ7',
  START_LAT:      'fldAUf6IwteFufphx',
  START_LNG:      'fldF7blLSgdAq9mNz',
  EOD_LINK:       'fldMTHfIuLaJoKdtv',
  LOCATION_UPDATED_AT: 'fldqHF3twipXfVmc3',
}

// Note: Pilots.Current Latitude/Longitude (fldUueaq9Z2sAMq84 / fldQsQfdRFDhZFsBO) are
// lookup fields sourced from this table's START_LAT/START_LNG via the Pilot<->Preflight
// link, so they update automatically whenever we write START_LAT/START_LNG below —
// no separate write to the Pilots table is needed (an earlier version tried to PATCH
// them directly, which silently failed since lookup fields are read-only).

function verifyToken(req) {
  const auth = req.headers.authorization || ''
  return jwt.verify(auth.replace('Bearer ', ''), process.env.JWT_SECRET)
}

// See _airtable.js centralDateStr — must use Central time, not server UTC.
function today() {
  return centralDateStr()
}

export default async function handler(req, res) {
  try {
    const pilot = verifyToken(req)

    if (req.method === 'GET') {
      const todayStr = today()
      const pilotName = (pilot.displayName || pilot.firstName || '').replace(/['"]/g, '')
      const fields = [F.DATE, F.PILOT, F.TRAVEL_DAY, F.GO_NOGO, F.PROJECT]

      let records
      if (pilotName) {
        const filter = "AND(DATESTR({" + F.DATE + "})='" + todayStr + "', FIND('" + pilotName + "', ARRAYJOIN({" + F.PILOT + "})))"
        records = await airtableGetAll(PREFLIGHT_TABLE, filter, fields)
      } else {
        const filter = "DATESTR({" + F.DATE + "})='" + todayStr + "'"
        records = await airtableGetAll(PREFLIGHT_TABLE, filter, fields)
      }

      console.log('[preflight GET] date=' + todayStr + ' pilot="' + pilotName + '" recordsFound=' + records.length)

      const rec = pilotName
        ? (records[0] || null)
        : (records.find(r => (r.fields[F.PILOT] || []).includes(pilot.pilotRecordId)) || null)

      if (!rec) return res.json({ exists: false })
      return res.json({
        exists: true,
        preflightId: rec.id,
        travelDay: rec.fields[F.TRAVEL_DAY] || false,
        goNogo: rec.fields[F.GO_NOGO] || null,
        // Which regional Verizon project this pilot picked on today's preflight
        // (link to project — multipleRecordLinks, one value). The EOD report
        // needs to link to the SAME project, not a hardcoded guess — see App.jsx.
        projectId: (rec.fields[F.PROJECT] || [])[0] || null,
      })
    }

    if (req.method === 'POST') {
      const b = req.body
      const fields = {}

      fields[F.DATE]   = today()
      fields[F.PILOT]  = [pilot.pilotRecordId]

      if (b.projectId)        fields[F.PROJECT]      = [b.projectId]
      if (b.aircraftId)       fields[F.AIRCRAFT]     = [b.aircraftId]
      if (b.travelDay != null) fields[F.TRAVEL_DAY]  = !!b.travelDay
      if (b.travelingTo)      fields[F.TRAVELING_TO] = b.travelingTo
      if (b.visualObserver != null) fields[F.VISUAL_OBS] = !!b.visualObserver
      if (b.acres != null)    fields[F.ACRES]        = b.acres
      if (b.basin)            fields[F.BASIN]        = b.basin
      if (b.closestFlightAddr) fields[F.FLIGHT_ADDR] = b.closestFlightAddr
      if (b.nearestHospital)  fields[F.HOSPITAL]     = b.nearestHospital
      if (b.imsafe && b.imsafe.length)   fields[F.IMSAFE]       = b.imsafe
      if (b.weatherCheck && b.weatherCheck.length) fields[F.WEATHER_CHK] = b.weatherCheck
      if (b.weatherForecast)  fields[F.WEATHER_FCST] = b.weatherForecast
      if (b.airworthy)        fields[F.AIRWORTHY]    = b.airworthy
      if (b.airworthyNotes)   fields[F.AIRWORTHY_N]  = b.airworthyNotes
      if (b.airspace && b.airspace.length) fields[F.AIRSPACE]     = b.airspace
      if (b.tfrPresent)       fields[F.TFR]          = b.tfrPresent
      if (b.laancRequired)    fields[F.LAANC_REQ]    = b.laancRequired
      if (b.crewRest)         fields[F.CREW_REST]    = b.crewRest
      if (b.crewDays)         fields[F.CREW_DAYS]    = b.crewDays
      if (b.crewWork)         fields[F.CREW_WORK]    = b.crewWork
      if (b.wxWind)           fields[F.WX_WIND]      = b.wxWind
      if (b.wxVis)            fields[F.WX_VIS]       = b.wxVis
      if (b.wxCeil)           fields[F.WX_CEIL]      = b.wxCeil
      if (b.wxRain)           fields[F.WX_RAIN]      = b.wxRain
      if (b.wxTemp)           fields[F.WX_TEMP]      = b.wxTemp
      if (b.wxTstorm)         fields[F.WX_TSTORM]    = b.wxTstorm
      if (b.riskTotal)        fields[F.RISK_TOTAL]   = b.riskTotal
      if (b.additionalRisks)  fields[F.ADD_RISKS]    = b.additionalRisks
      if (b.mitigatingFactors) fields[F.MITIGATING]  = b.mitigatingFactors
      if (b.missionOverview != null) fields[F.MISSION_OVW] = !!b.missionOverview
      if (b.goNogo)           fields[F.GO_NOGO]      = b.goNogo
      if (b.notes)            fields[F.NOTES]        = b.notes
      if (b.startLat != null) fields[F.START_LAT]    = b.startLat
      if (b.startLng != null) fields[F.START_LNG]    = b.startLng
      if (b.startLat != null && b.startLng != null) fields[F.LOCATION_UPDATED_AT] = new Date().toISOString()

      const emergId = process.env.EMERGENCY_CONTACT_RECORD_ID
      if (emergId) fields[F.EMERG_CONTACT] = [emergId]

      const result = await airtablePost(PREFLIGHT_TABLE, fields)

      return res.json({ success: true, preflightId: result.id })
    }

    if (req.method === 'PATCH') {
      const { preflightId, lat, lng } = req.body
      if (!preflightId || lat == null || lng == null) {
        return res.status(400).json({ error: 'Missing preflightId, lat, or lng' })
      }
      const fields = {}
      fields[F.START_LAT] = lat
      fields[F.START_LNG] = lng
      fields[F.LOCATION_UPDATED_AT] = new Date().toISOString()
      await airtablePatch(PREFLIGHT_TABLE, preflightId, fields)
      return res.json({ success: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    console.error('preflight error:', err)
    return res.status(500).json({ error: err.message || 'Internal server error' })
  }
}

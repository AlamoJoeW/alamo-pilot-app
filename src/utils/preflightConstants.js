/**
 * preflightConstants.js
 * Option arrays for the Preflight form â split out to keep Preflight.jsx lean.
 */

export const IMSAFE_OPTIONS = [
  'I.M.S.A.F.E.',
  'I - Illness',
  'M - medication',
  'S - Stress',
  'A - Alcohol',
  'F - fatigue',
  'E - Emotion',
]

export const WEATHER_CHECK_OPTIONS = [
  'Temperature Within Aircraft Tolerance',
  'Wind Within Aircraft Tolerances',
  'Visibility >3 Miles',
  'Ceiling >900 feet',
  'No Precipitation',
  'No Thunderstorms Within 5 miles',
]

export const AIRSPACE_OPTIONS = ['Class B', 'Class C', 'Class D', 'Class E', 'Class G']
export const BASIN_OPTIONS    = ['Eagle Ford', 'LAHA', 'SOHA']

// ââ Crew Risk Matrix ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

export const CREW_REST_OPTIONS = [
  '>8 Hrs  - Low risk = 0',
  '6-7 Hrs - Medium Risk = 1',
  '4 - 6 Hrs - High Risk = 2',
  '< 4 Hrs - Extreme Risk = 3',
]

export const CREW_DAYS_OPTIONS = [
  '>14 Days- Low risk = 0',
  '15 - 21 Days- Medium Risk = 1',
  '22 - 28- Days - High Risk = 2',
  '> 28 Days - Extreme Risk = 3',
]

export const CREW_WORK_OPTIONS = [
  '>8 Hrs  - Low risk = 0',
  '8 - 10 Hrs - Medium Risk = 1',
  '10 - 12 Hrs - High Risk = 2',
  '< 12 Hrs - Extreme Risk = 3',
]

// ââ Weather Risk Matrix ââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

export const WX_WIND_OPTIONS = [
  '>10 MPH- Low risk = 0',
  '10 - 18 MPH - Medium Risk = 1',
  '19- 26 MPH - High Risk = 2',
  '< 26Hrs - Extreme Risk = 3',
]

export const WX_VIS_OPTIONS = [
  '>10 Miles- Low risk = 0',
  '5 - 10 Miles - Medium Risk = 1',
  '3 - 5 Miles - High Risk = 2',
  '< 3 Miles- Extreme Risk = 3',
]

export const WX_CEIL_OPTIONS = [
  '>900 Ft- Low risk = 0',
  '700 - 900 Ft- Medium Risk = 1',
  '500 - 700 Ft - High Risk = 2',
  '500 Ft - Extreme Risk = 3',
]

export const WX_RAIN_OPTIONS = [
  '>10%- Low risk = 0',
  '10% - 50% - Medium Risk = 1',
  '50% - 80% - High Risk = 2',
  '>80% - Extreme Risk = 3',
]

export const WX_TEMP_OPTIONS = [
  '>40Â°F - 90Â°F Low risk = 0',
  '35Â°F - 40Â°F or 90Â° - 95Â° - Medium Risk = 1',
  '30Â°F - 35Â°F or 95Â°F - 100Â°F - High Risk = 2',
  '<30Â°F or > 100Â°F Extreme Risk = 3',
]

export const WX_TSTORM_OPTIONS = [
  'None',
  '>10 Miles  - Medium Risk = 1',
  '5 - 10 Miles- High Risk = 2',
  '<5 Miles Extreme Risk = 3',
]

export const RISK_TOTAL_OPTIONS = [
  '>5 Good to fly',
  '5 - 10 or any extreme risk - use sound judgement and monitor the identified risk',
  '>10 - Flight operations must be discussed and approved with the project manager',
]

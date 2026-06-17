/**
 * Preflight.jsx
 * Morning preflight checklist for Alamo Airborne pilots.
 * Multi-step form gated before map/collection access each day.
 *
 * Props:
 *   pilot      – pilot info object from auth (name, etc.)
 *   onComplete – callback(preflightId, projectId) called after successful POST
 */

import { useState, useEffect } from 'react'
import {
  IMSAFE_OPTIONS,
  WEATHER_CHECK_OPTIONS,
  AIRSPACE_OPTIONS,
  BASIN_OPTIONS,
  CREW_REST_OPTIONS,
  CREW_DAYS_OPTIONS,
  CREW_WORK_OPTIONS,
  WX_WIND_OPTIONS,
  WX_VIS_OPTIONS,
  WX_CEIL_OPTIONS,
  WX_RAIN_OPTIONS,
  WX_TEMP_OPTIONS,
  WX_TSTORM_OPTIONS,
  RISK_TOTAL_OPTIONS,
} from '../utils/preflightConstants'

// ─── Inline field components ───────────────────────────────────────────────────

function SelectField({ label, value, onChange, options, disabled }) {
  return (
    <div className="pf-field">
      <label className="field-label">{label}</label>
      <select
        className="pf-select"
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
      >
        <option value="">— Select —</option>
        {options.map(opt => (
          <option key={opt.value ?? opt} value={opt.value ?? opt}>
            {opt.label ?? opt}
          </option>
        ))}
      </select>
    </div>
  )
}

function MultiSelectField({ label, value = [], onChange, options }) {
  const toggle = opt => {
    if (value.includes(opt)) {
      onChange(value.filter(v => v !== opt))
    } else {
      onChange([...value, opt])
    }
  }
  return (
    <div className="pf-field">
      <label className="field-label">{label}</label>
      <div className="pf-checkbox-group">
        {options.map(opt => (
          <label key={opt} className="pf-checkbox-row">
            <input
              type="checkbox"
              checked={value.includes(opt)}
              onChange={() => toggle(opt)}
            />
            <span>{opt}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

function TextAreaField({ label, value, onChange, placeholder, rows = 3 }) {
  return (
    <div className="pf-field">
      <label className="field-label">{label}</label>
      <textarea
        className="notes-textarea"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
      />
    </div>
  )
}

function CheckboxField({ label, checked, onChange }) {
  return (
    <label className="pf-checkbox-row pf-checkbox-single">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  )
}

function InputField({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div className="pf-field">
      <label className="field-label">{label}</label>
      <input
        className="pf-input"
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getToken() {
  return localStorage.getItem('alamo_token') || ''
}

function buildSteps(projectType, travelDay) {
  if (travelDay) return [1, 2]
  const steps = [1, 3, 4, 5]
  if (projectType && projectType !== 'verizon') steps.push(6)
  steps.push(7)
  return steps
}

function stepLabel(stepId) {
  const labels = {
    1: 'Basic Info',
    2: 'Travel Day',
    3: 'Flight Info',
    4: 'IMSAFE & Weather',
    5: 'Airworthiness & Airspace',
    6: 'Risk Assessment',
    7: 'Final',
  }
  return labels[stepId] || ''
}

// ─── Main Component ───────────────────────────────────────────────────────────

const INITIAL_FORM = {
  projectId: '',
  aircraftId: '',
  travelDay: false,
  travelingTo: '',
  visualObserver: false,
  acres: '',
  basin: '',
  closestFlightAddr: '',
  nearestHospital: '',
  imsafe: [],
  weatherCheck: [],
  weatherForecast: '',
  airworthy: '',
  airworthyNotes: '',
  airspace: [],
  tfrPresent: '',
  laancRequired: '',
  crewRest: '',
  crewDays: '',
  crewWork: '',
  wxWind: '',
  wxVis: '',
  wxCeil: '',
  wxRain: '',
  wxTemp: '',
  wxTstorm: '',
  riskTotal: '',
  additionalRisks: '',
  mitigatingFactors: '',
  missionOverview: false,
  goNogo: '',
  notes: '',
}

export default function Preflight({ pilot, onComplete }) {
  const [form, setForm] = useState(INITIAL_FORM)
  const [projects, setProjects] = useState([])
  const [aircraft, setAircraft] = useState([])
  const [loading, setLoading] = useState(true)
  const [stepIndex, setStepIndex] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [gpsLat, setGpsLat] = useState(null)
  const [gpsLng, setGpsLng] = useState(null)

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          setGpsLat(pos.coords.latitude)
          setGpsLng(pos.coords.longitude)
        },
        () => {}
      )
    }
  }, [])

  useEffect(() => {
    async function loadData() {
      try {
        const [pRes, aRes] = await Promise.all([
          fetch('/api/projects', { headers: { Authorization: `Bearer ${getToken()}` } }),
          fetch('/api/aircraft',  { headers: { Authorization: `Bearer ${getToken()}` } }),
        ])
        const [pData, aData] = await Promise.all([pRes.json(), aRes.json()])
        setProjects(pData.projects || [])
        setAircraft(aData.aircraft || [])
      } catch {
        setError('Failed to load projects/aircraft. Please refresh.')
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  const selectedProject = projects.find(p => p.id === form.projectId)
  const projectType = selectedProject?.type || ''
  const steps = buildSteps(projectType, form.travelDay)
  const currentStep = steps[stepIndex]
  const totalSteps = steps.length

  function setField(key, val) {
    setForm(prev => ({ ...prev, [key]: val }))
  }

  function handleNext() {
    setError('')
    if (stepIndex < steps.length - 1) {
      setStepIndex(i => i + 1)
      window.scrollTo(0, 0)
    }
  }

  function handleBack() {
    setError('')
    if (stepIndex > 0) {
      setStepIndex(i => i - 1)
      window.scrollTo(0, 0)
    }
  }

  function handleTravelDayToggle(val) {
    setField('travelDay', val)
    setStepIndex(0)
  }

  function handleProjectChange(id) {
    setField('projectId', id)
    setStepIndex(0)
  }

  async function handleSubmit() {
    setError('')
    setSubmitting(true)
    try {
      const payload = {
        projectId: form.projectId,
        aircraftId: form.aircraftId,
        travelDay: form.travelDay,
        travelingTo: form.travelingTo || undefined,
        visualObserver: form.visualObserver,
        acres: form.acres ? Number(form.acres) : undefined,
        basin: form.basin || undefined,
        closestFlightAddr: form.closestFlightAddr,
        nearestHospital: form.nearestHospital,
        imsafe: form.imsafe,
        weatherCheck: form.weatherCheck,
        weatherForecast: form.weatherForecast,
        airworthy: form.airworthy,
        airworthyNotes: form.airworthyNotes || undefined,
        airspace: form.airspace,
        tfrPresent: form.tfrPresent,
        laancRequired: form.laancRequired,
        crewRest: form.crewRest || undefined,
        crewDays: form.crewDays || undefined,
        crewWork: form.crewWork || undefined,
        wxWind: form.wxWind || undefined,
        wxVis: form.wxVis || undefined,
        wxCeil: form.wxCeil || undefined,
        wxRain: form.wxRain || undefined,
        wxTemp: form.wxTemp || undefined,
        wxTstorm: form.wxTstorm || undefined,
        riskTotal: form.riskTotal || undefined,
        additionalRisks: form.additionalRisks,
        mitigatingFactors: form.mitigatingFactors,
        missionOverview: form.missionOverview,
        goNogo: form.goNogo,
        notes: form.notes,
        startLat: gpsLat,
        startLng: gpsLng,
      }

      const res = await fetch('/api/preflight', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Submission failed')

      localStorage.setItem('alamo_preflight_date', new Date().toISOString().split('T')[0])
      localStorage.setItem('alamo_project_id', form.projectId)
      onComplete(data.preflightId, form.projectId)
    } catch (err) {
      setError(err.message || 'Submission failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="preflight-screen">
        <div className="pf-loading">Loading preflight…</div>
      </div>
    )
  }

  return (
    <div className="preflight-screen">
      <div className="pf-header">
        <div className="pf-header-title">
          <span className="pf-icon">✈️</span>
          <div>
            <h1 className="pf-title">Daily Preflight</h1>
            <p className="pf-subtitle">
              {pilot?.firstName || pilot?.displayName || 'Pilot'} · {new Date().toLocaleDateString()}
            </p>
          </div>
        </div>
        <div className="pf-progress-row">
          <span className="pf-progress-label">Step {stepIndex + 1} of {totalSteps}</span>
          <div className="pf-dots">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`pf-dot ${i < stepIndex ? 'done' : i === stepIndex ? 'active' : ''}`}
              />
            ))}
          </div>
          <span className="pf-step-name">{stepLabel(currentStep)}</span>
        </div>
        <div className="pf-progress-track">
          <div
            className="pf-progress-fill"
            style={{ width: `${((stepIndex + 1) / totalSteps) * 100}%` }}
          />
        </div>
      </div>

      <div className="pf-body">
        {error && <div className="error-msg" style={{ marginBottom: 16 }}>{error}</div>}

        {currentStep === 1 && (
          <StepBasicInfo
            form={form}
            projects={projects}
            aircraft={aircraft}
            onProjectChange={handleProjectChange}
            onAircraftChange={v => setField('aircraftId', v)}
            onTravelDayChange={handleTravelDayToggle}
          />
        )}
        {currentStep === 2 && (
          <StepTravelDay form={form} onChange={v => setField('travelingTo', v)} />
        )}
        {currentStep === 3 && (
          <StepFlightInfo form={form} projectType={projectType} setField={setField} />
        )}
        {currentStep === 4 && (
          <StepImsafeWeather form={form} setField={setField} />
        )}
        {currentStep === 5 && (
          <StepAirworthinessAirspace form={form} setField={setField} />
        )}
        {currentStep === 6 && (
          <StepRiskAssessment form={form} setField={setField} />
        )}
        {currentStep === 7 && (
          <StepFinal form={form} setField={setField} />
        )}
      </div>

      <div className="pf-nav">
        {stepIndex > 0 && (
          <button className="pf-btn-back" onClick={handleBack} disabled={submitting}>
            ← Back
          </button>
        )}
        {currentStep === 2 || stepIndex === steps.length - 1 ? (
          <button className="btn-primary btn-full" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit Preflight'}
          </button>
        ) : (
          <button className="btn-primary pf-btn-next" onClick={handleNext}>
            Next →
          </button>
        )}
      </div>
    </div>
  )
}

function StepBasicInfo({ form, projects, aircraft, onProjectChange, onAircraftChange, onTravelDayChange }) {
  const projectOptions = projects.map(p => ({ value: p.id, label: p.name }))
  const aircraftOptions = aircraft.map(a => ({ value: a.id, label: a.name }))
  return (
    <div className="pf-step">
      <h2 className="pf-step-heading">Basic Info</h2>
      <SelectField label="Project" value={form.projectId} onChange={onProjectChange} options={projectOptions} />
      <SelectField label="Aircraft" value={form.aircraftId} onChange={onAircraftChange} options={aircraftOptions} />
      <CheckboxField label="Travel Day (no flight operations today)" checked={form.travelDay} onChange={onTravelDayChange} />
    </div>
  )
}

function StepTravelDay({ form, onChange }) {
  return (
    <div className="pf-step">
      <h2 className="pf-step-heading">Travel Day</h2>
      <p className="pf-step-desc">No flight operations today. Enter your destination and submit to log this travel day.</p>
      <InputField label="Traveling To?" value={form.travelingTo} onChange={onChange} placeholder="e.g. San Antonio, TX" />
    </div>
  )
}

function StepFlightInfo({ form, projectType, setField }) {
  return (
    <div className="pf-step">
      <h2 className="pf-step-heading">Flight Info</h2>
      <CheckboxField label="Visual Observer present" checked={form.visualObserver} onChange={v => setField('visualObserver', v)} />
      <InputField label="Acres Assigned" value={form.acres} onChange={v => setField('acres', v)} placeholder="e.g. 150" type="number" />
      {projectType === 'methane' && (
        <SelectField label="Basin" value={form.basin} onChange={v => setField('basin', v)} options={BASIN_OPTIONS} />
      )}
      <InputField label="Closest Flight Address" value={form.closestFlightAddr} onChange={v => setField('closestFlightAddr', v)} placeholder="Street address near flight area" />
      <InputField label="Nearest Hospital" value={form.nearestHospital} onChange={v => setField('nearestHospital', v)} placeholder="Hospital name / address" />
    </div>
  )
}

function StepImsafeWeather({ form, setField }) {
  return (
    <div className="pf-step">
      <h2 className="pf-step-heading">I.M.S.A.F.E. & Weather</h2>
      <div className="pf-section-label">IMSAFE Self-Assessment</div>
      <MultiSelectField label="Check all that apply" value={form.imsafe} onChange={v => setField('imsafe', v)} options={IMSAFE_OPTIONS} />
      <div className="pf-divider" />
      <div className="pf-section-label">Weather Check</div>
      <MultiSelectField label="Conditions verified" value={form.weatherCheck} onChange={v => setField('weatherCheck', v)} options={WEATHER_CHECK_OPTIONS} />
      <TextAreaField label="Weather Forecast Notes" value={form.weatherForecast} onChange={v => setField('weatherForecast', v)} placeholder="Describe forecast, wind, visibility, etc." rows={3} />
    </div>
  )
}

function StepAirworthinessAirspace({ form, setField }) {
  return (
    <div className="pf-step">
      <h2 className="pf-step-heading">Airworthiness & Airspace</h2>
      <SelectField label="Aircraft Airworthy?" value={form.airworthy} onChange={v => setField('airworthy', v)} options={['Yes', 'No']} />
      {form.airworthy === 'No' && (
        <TextAreaField label="Airworthiness Notes" value={form.airworthyNotes} onChange={v => setField('airworthyNotes', v)} placeholder="Describe the issue…" rows={3} />
      )}
      <MultiSelectField label="Airspace Class" value={form.airspace} onChange={v => setField('airspace', v)} options={AIRSPACE_OPTIONS} />
      <SelectField label="TFR / NOTAM Present?" value={form.tfrPresent} onChange={v => setField('tfrPresent', v)} options={['Yes', 'No']} />
      <SelectField label="LAANC Required?" value={form.laancRequired} onChange={v => setField('laancRequired', v)} options={['Yes', 'No']} />
    </div>
  )
}

function StepRiskAssessment({ form, setField }) {
  return (
    <div className="pf-step">
      <h2 className="pf-step-heading">Risk Assessment</h2>
      <div className="pf-section-label">Crew Risk Matrix</div>
      <SelectField label="REST (Hours)" value={form.crewRest} onChange={v => setField('crewRest', v)} options={CREW_REST_OPTIONS} />
      <SelectField label="Days of Deployment" value={form.crewDays} onChange={v => setField('crewDays', v)} options={CREW_DAYS_OPTIONS} />
      <SelectField label="Work Day (Hours)" value={form.crewWork} onChange={v => setField('crewWork', v)} options={CREW_WORK_OPTIONS} />
      <div className="pf-divider" />
      <div className="pf-section-label">Weather Risk Matrix</div>
      <SelectField label="Wind (MPH)" value={form.wxWind} onChange={v => setField('wxWind', v)} options={WX_WIND_OPTIONS} />
      <SelectField label="Visibility" value={form.wxVis} onChange={v => setField('wxVis', v)} options={WX_VIS_OPTIONS} />
      <SelectField label="Ceiling (Ft)" value={form.wxCeil} onChange={v => setField('wxCeil', v)} options={WX_CEIL_OPTIONS} />
      <SelectField label="Rain (%)" value={form.wxRain} onChange={v => setField('wxRain', v)} options={WX_RAIN_OPTIONS} />
      <SelectField label="Temperature (°F)" value={form.wxTemp} onChange={v => setField('wxTemp', v)} options={WX_TEMP_OPTIONS} />
      <SelectField label="Thunderstorms" value={form.wxTstorm} onChange={v => setField('wxTstorm', v)} options={WX_TSTORM_OPTIONS} />
      <div className="pf-divider" />
      <SelectField label="Total Risk Value" value={form.riskTotal} onChange={v => setField('riskTotal', v)} options={RISK_TOTAL_OPTIONS} />
    </div>
  )
}

function StepFinal({ form, setField }) {
  return (
    <div className="pf-step">
      <h2 className="pf-step-heading">Final Review</h2>
      <TextAreaField label="Additional Risks" value={form.additionalRisks} onChange={v => setField('additionalRisks', v)} placeholder="Any other risks identified…" rows={3} />
      <TextAreaField label="Mitigating Factors" value={form.mitigatingFactors} onChange={v => setField('mitigatingFactors', v)} placeholder="Steps taken to mitigate risks…" rows={3} />
      <CheckboxField label="Mission Overview reviewed and understood" checked={form.missionOverview} onChange={v => setField('missionOverview', v)} />
      <SelectField label="GO / NO-GO" value={form.goNogo} onChange={v => setField('goNogo', v)} options={['GO', 'NO-GO']} />
      <TextAreaField label="Additional Notes" value={form.notes} onChange={v => setField('notes', v)} placeholder="Anything else to note for today…" rows={3} />
    </div>
  )
}

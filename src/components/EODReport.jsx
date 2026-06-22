/**
 * EODReport.jsx
 * End-of-day report form for Alamo Airborne pilots.
 * Appears full-screen (like Preflight) when pilot taps "Submit EOD".
 * Sites are pre-populated from what they marked during the day;
 * pilot fills in the remaining fields before submitting.
 *
 * Props:
 *   pilot       – pilot info object from auth
 *   sites       – all sites array
 *   preflightId – ID of today's preflight record (for linking)
 *   onSubmit    – async fn(payload) → called with the form data to submit
 *   onCancel    – fn() → called when pilot taps Cancel on step 1
 */

import { useState } from 'react'

// ─── Reusable field components (same pattern as Preflight) ───────────────────

function SelectField({ label, value, onChange, options }) {
  return (
    <div className="pf-field">
      <label className="field-label">{label}</label>
      <select
        className="pf-select"
        value={value}
        onChange={e => onChange(e.target.value)}
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

// ─── Site summary row ─────────────────────────────────────────────────────────

function SiteRow({ site, color, badge }) {
  const label = site.address || site.fuzeId || site.id
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '10px 0',
      borderBottom: '1px solid var(--border)',
    }}>
      <span style={{
        fontSize: 11,
        fontWeight: 700,
        color: '#fff',
        background: color,
        borderRadius: 4,
        padding: '2px 7px',
        flexShrink: 0,
      }}>{badge}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--text)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {label}
        </div>
        {site.city && (
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>
            {site.city}{site.state ? `, ${site.state}` : ''}
          </div>
        )}
      </div>
    </div>
  )
}

function NumberInputField({ label, value, onChange }) {
  return (
    <div className="pf-field">
      <label className="field-label">{label}</label>
      <input
        type="number"
        min="0"
        className="pf-select"
        value={value}
        onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        style={{ width: '100%' }}
      />
    </div>
  )
}

// ─── Step 1: Site Review ──────────────────────────────────────────────────────

function StepSiteReview({ collected, partial, mob, form, setField }) {
  const total = collected.length + partial.length + mob.length

  return (
    <div className="pf-step">
      <h2 className="pf-step-heading">Site Summary</h2>
      <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
        {total} site{total !== 1 ? 's' : ''} marked today. Review before continuing.
      </p>

      {collected.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div className="pf-section-label" style={{ color: '#22c55e' }}>
            Collected ({collected.length})
          </div>
          {collected.map(s => (
            <SiteRow key={s.id} site={s} color="#22c55e" badge="COLLECTED" />
          ))}
        </div>
      )}

      {partial.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div className="pf-section-label" style={{ color: '#ca8a04' }}>
            Partial ({partial.length})
          </div>
          {partial.map(s => (
            <SiteRow key={s.id} site={s} color="#ca8a04" badge="PARTIAL" />
          ))}
        </div>
      )}

      {mob.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div className="pf-section-label" style={{ color: '#ea580c' }}>
            MOB Fees ({mob.length})
          </div>
          {mob.map(s => (
            <SiteRow key={s.id} site={s} color="#ea580c" badge="MOB" />
          ))}
        </div>
      )}

      {total === 0 && (
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--text2)', fontSize: 14 }}>
          No sites marked yet.
        </div>
      )}

      <div className="pf-divider" style={{ marginTop: 16 }} />
      <h3 className="pf-section-label" style={{ marginBottom: 8 }}>Counts (enter manually)</h3>
      <NumberInputField
        label="# of Full Assets Collected"
        value={form.fullCount}
        onChange={v => setField('fullCount', v)}
      />
      <NumberInputField
        label="# of Partial Assets Collected"
        value={form.partialCount}
        onChange={v => setField('partialCount', v)}
      />
    </div>
  )
}

// ─── Step 2: Flight Conditions ────────────────────────────────────────────────

function StepFlightConditions({ form, setField }) {
  return (
    <div className="pf-step">
      <h2 className="pf-step-heading">Flight Conditions</h2>

      <SelectField
        label="Weather Conditions"
        value={form.weatherConditions}
        onChange={v => setField('weatherConditions', v)}
        options={[
          'Clear / VFR',
          'Partly Cloudy',
          'Overcast',
          'Windy (>15 mph)',
          'Rain / Precip',
          'Foggy / Low Vis',
        ]}
      />

      <SelectField
        label="Flight Operations"
        value={form.flightOps}
        onChange={v => setField('flightOps', v)}
        options={[
          'Normal — no issues',
          'Minor issues — still completed',
          'Significant issues — affected collection',
          'Suspended — could not fly',
        ]}
      />

      <SelectField
        label="Aircraft Status"
        value={form.aircraftStatus}
        onChange={v => setField('aircraftStatus', v)}
        options={[
          'Airworthy — no issues',
          'Minor maintenance needed',
          'Grounded — needs service',
        ]}
      />

      <div className="pf-divider" />

      <CheckboxField
        label="Incident occurred today"
        checked={form.incident}
        onChange={v => setField('incident', v)}
      />

      {form.incident && (
        <TextAreaField
          label="Incident Description"
          value={form.incidentNotes}
          onChange={v => setField('incidentNotes', v)}
          placeholder="Describe what happened, location, and any actions taken…"
          rows={4}
        />
      )}
    </div>
  )
}

// ─── Step 3: Access Issues & Notes ───────────────────────────────────────────

function StepAccessIssues({ form, setField }) {
  return (
    <div className="pf-step">
      <h2 className="pf-step-heading">Access & Notes</h2>

      <CheckboxField
        label="Access issues encountered today"
        checked={form.accessIssues}
        onChange={v => setField('accessIssues', v)}
      />

      {form.accessIssues && (
        <TextAreaField
          label="Access Issue Details"
          value={form.accessIssueNotes}
          onChange={v => setField('accessIssueNotes', v)}
          placeholder="Site address, nature of issue, who was contacted…"
          rows={4}
        />
      )}

      <div className="pf-divider" />

      <TextAreaField
        label="General Notes"
        value={form.notes}
        onChange={v => setField('notes', v)}
        placeholder="Anything else to note — supervisor feedback, unusual finds, follow-up needed…"
        rows={4}
      />
    </div>
  )
}

// ─── Step 4: Sign Off ─────────────────────────────────────────────────────────

function StepSignOff({ form, setField }) {
  return (
    <div className="pf-step">
      <h2 className="pf-step-heading">Sign Off</h2>

      <SelectField
        label="Ready to fly tomorrow?"
        value={form.tomorrowReady}
        onChange={v => setField('tomorrowReady', v)}
        options={['Yes', 'No — see notes', 'Travel day tomorrow']}
      />

      <TextAreaField
        label="Tomorrow's Notes (optional)"
        value={form.tomorrowNotes}
        onChange={v => setField('tomorrowNotes', v)}
        placeholder="Anything to plan for tomorrow…"
        rows={3}
      />

      <div className="pf-divider" />

      <CheckboxField
        label="I confirm the information above is accurate"
        checked={form.confirmed}
        onChange={v => setField('confirmed', v)}
      />
    </div>
  )
}

// ─── Step config ──────────────────────────────────────────────────────────────

const STEPS = [
  { id: 'sites',      label: 'Site Review' },
  { id: 'conditions', label: 'Flight Conditions' },
  { id: 'access',     label: 'Access & Notes' },
  { id: 'signoff',    label: 'Sign Off' },
]

const INITIAL_FORM = {
  fullCount:         '',
  partialCount:      '',
  weatherConditions: '',
  flightOps:         '',
  aircraftStatus:    '',
  incident:          false,
  incidentNotes:     '',
  accessIssues:      false,
  accessIssueNotes:  '',
  notes:             '',
  tomorrowReady:     '',
  tomorrowNotes:     '',
  confirmed:         false,
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function EODReport({ pilot, sites, preflightId, onSubmit, onCancel }) {
  const [form, setFormState] = useState(INITIAL_FORM)
  const [stepIndex, setStepIndex] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const collected = sites.filter(s => s.collectedApp)
  const partial   = sites.filter(s => s.partialCollection)
  const mob       = sites.filter(s => s.mobFee)

  function setField(key, val) {
    setFormState(prev => ({ ...prev, [key]: val }))
  }

  function handleNext() {
    setError('')
    if (stepIndex < STEPS.length - 1) {
      setStepIndex(i => i + 1)
      window.scrollTo(0, 0)
    }
  }

  function handleBack() {
    setError('')
    if (stepIndex > 0) {
      setStepIndex(i => i - 1)
      window.scrollTo(0, 0)
    } else {
      onCancel()
    }
  }

  async function handleSubmit() {
    if (!form.confirmed) {
      setError('Please check the confirmation box before submitting.')
      return
    }
    setError('')
    setSubmitting(true)
    try {
      await onSubmit({
        collectedIds: collected.map(s => s.id),
        partialIds:   partial.map(s => s.id),
        mobIds:       mob.map(s => s.id),
        preflightId,
        eodForm: {
          fullCount:         form.fullCount !== '' ? Number(form.fullCount) : undefined,
          partialCount:      form.partialCount !== '' ? Number(form.partialCount) : undefined,
          weatherConditions: form.weatherConditions || undefined,
          flightOps:         form.flightOps || undefined,
          aircraftStatus:    form.aircraftStatus || undefined,
          incident:          form.incident,
          incidentNotes:     form.incidentNotes || undefined,
          accessIssues:      form.accessIssues,
          accessIssueNotes:  form.accessIssueNotes || undefined,
          notes:             form.notes || undefined,
          tomorrowReady:     form.tomorrowReady || undefined,
          tomorrowNotes:     form.tomorrowNotes || undefined,
        },
      })
    } catch (err) {
      setError(err.message || 'Submission failed. Please try again.')
      setSubmitting(false)
    }
  }

  const currentStep = STEPS[stepIndex]
  const isLast      = stepIndex === STEPS.length - 1

  return (
    <div className="preflight-screen">
      {/* Header */}
      <div className="pf-header">
        <div className="pf-header-title">
          <span className="pf-icon">📋</span>
          <div>
            <h1 className="pf-title">End of Day Report</h1>
            <p className="pf-subtitle">
              {pilot?.firstName || pilot?.displayName || 'Pilot'} · {new Date().toLocaleDateString()}
            </p>
          </div>
        </div>
        <div className="pf-progress-row">
          <span className="pf-progress-label">Step {stepIndex + 1} of {STEPS.length}</span>
          <div className="pf-dots">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`pf-dot ${i < stepIndex ? 'done' : i === stepIndex ? 'active' : ''}`}
              />
            ))}
          </div>
          <span className="pf-step-name">{currentStep.label}</span>
        </div>
        <div className="pf-progress-track">
          <div
            className="pf-progress-fill"
            style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Body */}
      <div className="pf-body">
        {error && <div className="error-msg" style={{ marginBottom: 16 }}>{error}</div>}

        {currentStep.id === 'sites' && (
          <StepSiteReview collected={collected} partial={partial} mob={mob} form={form} setField={setField} />
        )}
        {currentStep.id === 'conditions' && (
          <StepFlightConditions form={form} setField={setField} />
        )}
        {currentStep.id === 'access' && (
          <StepAccessIssues form={form} setField={setField} />
        )}
        {currentStep.id === 'signoff' && (
          <StepSignOff form={form} setField={setField} />
        )}
      </div>

      {/* Nav */}
      <div className="pf-nav">
        <button className="pf-btn-back" onClick={handleBack} disabled={submitting}>
          ← {stepIndex === 0 ? 'Cancel' : 'Back'}
        </button>

        {isLast ? (
          <button
            className="btn-primary btn-full"
            onClick={handleSubmit}
            disabled={submitting || !form.confirmed}
          >
            {submitting ? 'Submitting…' : 'Submit EOD'}
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

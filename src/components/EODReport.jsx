/**
 * EODReport.jsx
 * End-of-day report form for Alamo Airborne pilots, submitted directly from the
 * app instead of opening the Airtable form in a new tab.
 *
 * This mirrors the fields and conditional logic of the real, live Airtable EOD
 * form (base app3uLCFgt3Y0aPaa, form view viwRk1jZFiJUikDYt) as verified by
 * hand on 2026-07-27 — NOT the older draft of this component, which invented
 * fields (Weather/Flight Ops/Aircraft Status/Incident/Tomorrow-readiness) that
 * never existed on the real form or anywhere in the Airtable schema.
 *
 * Two conditional gates on the real form, both reproduced here:
 *   - "WERE ANY REFLIGHT'S COMPLETED TODAY?" (Yes/No) → reveals a count, a
 *     multi-select of which sites were re-flown, and a notes field.
 *   - "Did you visit a site that you could not collect today?" (Yes/No) →
 *     reveals a notes field for the mobilization-fee sites (the site LINKS for
 *     that come from mobIds — sites already marked MOB Fee during the day,
 *     same as the Site Summary step below — this gate is just the Y/N + notes).
 *
 * Props:
 *   pilot       – pilot info object from auth
 *   sites       – all sites array
 *   preflightId – ID of today's preflight record (for linking)
 *   projectId   – ID of the Airtable Project record (resolved automatically in
 *                 App.jsx — Alamo pilots are all on one project, so unlike the
 *                 real form we don't need to ask)
 *   onSubmit    – async fn(payload) → called with the form data to submit
 *   onCancel    – fn() → called when pilot taps Cancel on step 1
 */

import { useState } from 'react'

// ─── Reusable field components ────────────────────────────────────────────────

function SelectField({ label, value, onChange, options, required }) {
  return (
    <div className="pf-field">
      <label className="field-label">{label}{required && ' *'}</label>
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

function TextAreaField({ label, value, onChange, placeholder, rows = 3, required }) {
  return (
    <div className="pf-field">
      <label className="field-label">{label}{required && ' *'}</label>
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

function NumberInputField({ label, value, onChange, hint }) {
  return (
    <div className="pf-field">
      <label className="field-label">{label}</label>
      {hint && <p className="pf-field-hint">{hint}</p>}
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

// ─── Site summary row ─────────────────────────────────────────────────────────

function SiteRow({ site, color, badge, checkbox, checked, onToggle }) {
  const label = site.address || site.fuzeId || site.id
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 0',
        borderBottom: '1px solid var(--border)',
        cursor: checkbox ? 'pointer' : 'default',
      }}
      onClick={checkbox ? onToggle : undefined}
    >
      {checkbox && (
        <input type="checkbox" checked={!!checked} onChange={onToggle} onClick={e => e.stopPropagation()} />
      )}
      {badge && (
        <span style={{
          fontSize: 11,
          fontWeight: 700,
          color: '#fff',
          background: color,
          borderRadius: 4,
          padding: '2px 7px',
          flexShrink: 0,
        }}>{badge}</span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--text)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {site.siteId || label}
        </div>
        {(site.city || site.fuzeId) && (
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>
            FUZE: {site.fuzeId || '—'}{site.city ? ` · ${site.city}${site.state ? `, ${site.state}` : ''}` : ''}
          </div>
        )}
      </div>
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
        hint="Well pads, towers, poles, acres, etc. Do not include re-flys."
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

// ─── Step 2: Reflights ────────────────────────────────────────────────────────

function StepReflights({ sites, form, setField, toggleReflySite }) {
  return (
    <div className="pf-step">
      <h2 className="pf-step-heading">Reflights</h2>

      <SelectField
        label="Were any reflight's completed today?"
        value={form.reflightsYN}
        onChange={v => setField('reflightsYN', v)}
        options={['YES', 'NO']}
        required
      />

      {form.reflightsYN === 'YES' && (
        <>
          <NumberInputField
            label="Re-flys Collected"
            hint="Number of assets collected that were re-flys"
            value={form.reflysCount}
            onChange={v => setField('reflysCount', v)}
          />

          <div className="pf-field">
            <label className="field-label">Which sites were re-flown? *</label>
            <div style={{ maxHeight: 240, overflowY: 'auto' }}>
              {sites.length === 0 && (
                <div style={{ fontSize: 13, color: 'var(--text2)', padding: '8px 0' }}>No sites loaded.</div>
              )}
              {sites.map(s => (
                <SiteRow
                  key={s.id}
                  site={s}
                  checkbox
                  checked={form.reflySiteIds.includes(s.id)}
                  onToggle={() => toggleReflySite(s.id)}
                />
              ))}
            </div>
          </div>

          <TextAreaField
            label="Notes for any Re-flys or corrections that were done today"
            value={form.reflysNotes}
            onChange={v => setField('reflysNotes', v)}
            placeholder="List asset names…"
            rows={3}
            required
          />
        </>
      )}
    </div>
  )
}

// ─── Step 3: Mobilization ─────────────────────────────────────────────────────

function StepMobilization({ form, setField }) {
  return (
    <div className="pf-step">
      <h2 className="pf-step-heading">Mobilization</h2>

      <SelectField
        label="Did you visit a site that you could not collect today?"
        value={form.visitedUncollectedYN}
        onChange={v => setField('visitedUncollectedYN', v)}
        options={['Yes', 'No']}
        required
      />
      <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: -8, marginBottom: 16 }}>
        This is for a mobilization fee — an access form needs to have been submitted for the site.
      </p>

      {form.visitedUncollectedYN === 'Yes' && (
        <TextAreaField
          label="Notes for mobilization fee sites"
          value={form.mobNotes}
          onChange={v => setField('mobNotes', v)}
          placeholder="Select sites visited, but not collected, only…"
          rows={3}
          required
        />
      )}
    </div>
  )
}

// ─── Step 4: Sign Off ─────────────────────────────────────────────────────────

function StepSignOff({ form, setField }) {
  return (
    <div className="pf-step">
      <h2 className="pf-step-heading">Sign Off</h2>

      <TextAreaField
        label="General Notes"
        value={form.generalNotes}
        onChange={v => setField('generalNotes', v)}
        placeholder="Anything pertinent not mentioned above…"
        rows={4}
        required
      />

      <SelectField
        label="Are your flight logs for today synced in Airdata?"
        value={form.airdataSynced}
        onChange={v => setField('airdataSynced', v)}
        options={['YES', 'NO']}
        required
      />
      <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: -8, marginBottom: 16 }}>
        This is a reminder to sync your flights daily if they are not auto-syncing.
      </p>

      <div className="pf-divider" />

      <label className="pf-checkbox-row pf-checkbox-single">
        <input
          type="checkbox"
          checked={form.confirmed}
          onChange={e => setField('confirmed', e.target.checked)}
        />
        <span>I confirm the information above is accurate</span>
      </label>
    </div>
  )
}

// ─── Step config ──────────────────────────────────────────────────────────────

const STEPS = [
  { id: 'sites',        label: 'Site Review' },
  { id: 'reflights',    label: 'Reflights' },
  { id: 'mobilization', label: 'Mobilization' },
  { id: 'signoff',      label: 'Sign Off' },
]

const INITIAL_FORM = {
  fullCount:             '',
  partialCount:          '',
  reflightsYN:           '',
  reflysCount:           '',
  reflySiteIds:          [],
  reflysNotes:           '',
  visitedUncollectedYN:  '',
  mobNotes:              '',
  generalNotes:          '',
  airdataSynced:         '',
  confirmed:             false,
}

// ─── Main component ───────────────────────────────────────────────────────────

// A site's Collected/Partial/MOB checkbox can have been true for months —
// set by the old Airtable form, a legacy data import, or a prior day's app
// action — and would stay true forever with nothing to distinguish it from
// something the pilot actually did today. api/update-site.js stamps
// APP_STATUS_SET_AT every time a status action goes through the app (single
// or bulk), so "today" is the one signal that actually means "today." Same
// calendar-day check as AdminView.jsx's isMarkedToday.
function isMarkedToday(site) {
  if (!site.appStatusUpdatedAt) return false
  const d = new Date(site.appStatusUpdatedAt)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
}

export default function EODReport({ pilot, sites, preflightId, projectId, onSubmit, onCancel }) {
  const [form, setFormState] = useState(INITIAL_FORM)
  const [stepIndex, setStepIndex] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const collected = sites.filter(s => s.collectedApp && isMarkedToday(s))
  const partial   = sites.filter(s => s.partialCollection && isMarkedToday(s))
  const mob       = sites.filter(s => s.mobFee && isMarkedToday(s))

  function setField(key, val) {
    setFormState(prev => ({ ...prev, [key]: val }))
  }

  function toggleReflySite(id) {
    setFormState(prev => ({
      ...prev,
      reflySiteIds: prev.reflySiteIds.includes(id)
        ? prev.reflySiteIds.filter(x => x !== id)
        : [...prev.reflySiteIds, id],
    }))
  }

  function validateStep(stepId) {
    if (stepId === 'reflights') {
      if (!form.reflightsYN) return 'Please answer whether any reflights were completed today.'
      if (form.reflightsYN === 'YES' && (form.reflysCount === '' || !form.reflysNotes.trim())) {
        return 'Please fill in the re-fly count and notes.'
      }
    }
    if (stepId === 'mobilization') {
      if (!form.visitedUncollectedYN) return 'Please answer whether you visited a site you could not collect.'
      if (form.visitedUncollectedYN === 'Yes' && !form.mobNotes.trim()) {
        return 'Please add notes for the mobilization fee site(s).'
      }
    }
    return ''
  }

  function handleNext() {
    const err = validateStep(STEPS[stepIndex].id)
    if (err) {
      setError(err)
      return
    }
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

  function captureGPS() {
    return new Promise(resolve => {
      if (!navigator.geolocation) return resolve({ lat: null, lng: null })
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve({ lat: null, lng: null }),
        { enableHighAccuracy: false, timeout: 8000 }
      )
    })
  }

  async function handleSubmit() {
    if (!form.confirmed) {
      setError('Please check the confirmation box before submitting.')
      return
    }
    if (!form.generalNotes.trim()) {
      setError('General Notes is required.')
      return
    }
    if (!form.airdataSynced) {
      setError('Please confirm whether your Airdata flight logs are synced.')
      return
    }
    const reflightsErr = validateStep('reflights')
    if (reflightsErr) { setError(reflightsErr); return }
    const mobErr = validateStep('mobilization')
    if (mobErr) { setError(mobErr); return }

    setError('')
    setSubmitting(true)
    try {
      const { lat, lng } = await captureGPS()
      await onSubmit({
        collectedIds: collected.map(s => s.id),
        partialIds:   partial.map(s => s.id),
        mobIds:       mob.map(s => s.id),
        reflyIds:     form.reflySiteIds,
        preflightId,
        projectId,
        fullCount:    form.fullCount !== '' ? Number(form.fullCount) : undefined,
        partialCount: form.partialCount !== '' ? Number(form.partialCount) : undefined,
        endLat: lat,
        endLng: lng,
        eodForm: {
          reflightsYN:          form.reflightsYN || undefined,
          reflysCount:          form.reflysCount !== '' ? Number(form.reflysCount) : undefined,
          reflysNotes:          form.reflysNotes || undefined,
          visitedUncollectedYN: form.visitedUncollectedYN || undefined,
          mobNotes:             form.mobNotes || undefined,
          generalNotes:         form.generalNotes || undefined,
          airdataSynced:        form.airdataSynced || undefined,
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
        {currentStep.id === 'reflights' && (
          <StepReflights sites={sites} form={form} setField={setField} toggleReflySite={toggleReflySite} />
        )}
        {currentStep.id === 'mobilization' && (
          <StepMobilization form={form} setField={setField} />
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

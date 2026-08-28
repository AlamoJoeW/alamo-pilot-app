import { useState, useEffect, useCallback } from 'react'
import { checkAccessIssue } from '../utils/api'
import { isReflySite, needsAccessFormToCollect } from '../utils/mapColors'
import { fetchNwsConditions } from '../utils/weather'
import { formatCentralTime } from '../utils/centralTime'
import { formatDateOnly } from '../utils/formatDate'

const ACCESS_FORM_URL = 'https://airtable.com/app3uLCFgt3Y0aPaa/shrZ1KM4eEKKTyyo6'
const PREFLIGHT_FORM_URL = 'https://airtable.com/app3uLCFgt3Y0aPaa/shrvIwEMGXL6NBl4k'

const STATUS_LABELS = {
  collected: { label: 'Collected', color: '#22c55e', bg: '#052e16' },
  partial: { label: 'Partial', color: '#facc15', bg: '#2d2006' },
  mob: { label: 'MOB Fee', color: '#f97316', bg: '#2c1003' },
  none: { label: 'Not Collected', color: '#94a3b8', bg: '#1e293b' },
}

function getSiteStatus(site) {
  if (site.collectedApp) return 'collected'
  if (site.partialCollection) return 'partial'
  if (site.mobFee) return 'mob'
  return 'none'
}

function InfoRow({ label, value }) {
  if (!value) return null
  return (
    <div className="info-row">
      <span className="info-label">{label}</span>
      <span className="info-value">{value}</span>
    </div>
  )
}

// Pin icon shapes a pilot can choose per site — synced to Airtable's "App Pin
// Icon" field (api/_airtable.js FIELDS.PIN_ICON), visible on both the pilot
// map and the Admin view. Still tinted by the same status color as the
// default dot; see mapColors.js / MapView.jsx / utils/mapIcons.js.
const ICON_TYPES = [
  { type: null,       label: 'Default' },
  { type: 'building', label: 'Building' },
  { type: 'tower',    label: 'Tower' },
  { type: 'sba',      label: 'SBA' },
  { type: 'coa',      label: 'COA' },
  { type: 'laanc',    label: 'LAANC' },
]

function IconPicker({ value, onChange }) {
  return (
    <div className="icon-picker">
      <div className="icon-picker-label">Pin icon</div>
      <div className="icon-picker-row">
        {ICON_TYPES.map(opt => (
          <button
            key={opt.label}
            className={`icon-picker-btn ${(value || null) === opt.type ? 'active' : ''}`}
            onClick={() => onChange(opt.type)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// Freeform Notes editor for the detail sheet — same field/save path as the
// List view's inline note button (App.jsx handleNotesSave -> api/update-site.js
// Notes shape), just shown here too since this sheet opens from both Map and
// List taps and Joe wants Notes visible/editable wherever a site is opened.
export function NotesEditor({ site, onSave }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(site.notes || '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setValue(site.notes || '')
  }, [site.id, site.notes])

  if (!editing) {
    return (
      <div className="detail-notes">
        <div className="detail-notes-label">Notes</div>
        <button
          type="button"
          className={`detail-notes-view ${site.notes ? 'has-note' : ''}`}
          onClick={() => { setValue(site.notes || ''); setEditing(true) }}
        >
          {site.notes || <span className="detail-notes-placeholder">Tap to add a note…</span>}
        </button>
      </div>
    )
  }

  async function save() {
    setSaving(true)
    try {
      await onSave(site.id, value.trim())
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="detail-notes">
      <div className="detail-notes-label">Notes</div>
      <textarea
        className="detail-notes-textarea"
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="Add a note for this site…"
        autoFocus
        disabled={saving}
        rows={3}
      />
      <div className="detail-notes-btns">
        <button className="btn-check-again" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        <button className="btn-cancel-pending" onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
      </div>
    </div>
  )
}

// On-demand current wind + temperature for this site, shown above Map Color
// in the info list per Joe's request — deliberately gated behind a button
// tap rather than fetched automatically, since the site list runs into the
// thousands and a pilot only needs this for the one site they're standing
// at right now. See utils/weather.js for the NWS nearest-station lookup
// this calls, and airspaceLayer.js for the same "free, no-key, official
// government source" precedent this follows.
export function WeatherCheck({ site }) {
  const [state, setState] = useState('idle') // idle | loading | done | error
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  // Reset whenever the pilot opens a different site's sheet, so stale
  // conditions from the previously-viewed site never show under a new one.
  useEffect(() => {
    setState('idle')
    setData(null)
    setError('')
  }, [site.id])

  if (site.lat == null || site.lng == null) return null

  async function check() {
    setState('loading')
    setError('')
    try {
      const result = await fetchNwsConditions(site.lat, site.lng)
      setData(result)
      setState('done')
    } catch (err) {
      setError(err.message || 'Weather unavailable')
      setState('error')
    }
  }

  if (state === 'idle') {
    return (
      <div className="weather-row">
        <button type="button" className="weather-check-btn" onClick={check}>
          Check current wind &amp; temp
        </button>
      </div>
    )
  }

  if (state === 'loading') {
    return (
      <div className="weather-row">
        <div className="weather-loading">Checking nearest station…</div>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="weather-row">
        <div className="weather-error">
          <span>{error}</span>
          <button type="button" className="weather-retry-btn" onClick={check}>Retry</button>
        </div>
      </div>
    )
  }

  return (
    <div className="weather-row weather-row-done">
      <div className="weather-readings">
        <span>{data.tempF}°F</span>
        <span>
          {data.windMph != null ? `${data.windMph} mph${data.windDir ? ' ' + data.windDir : ''}` : 'Wind N/A'}
          {data.windGustMph != null ? ` (gust ${data.windGustMph})` : ''}
        </span>
      </div>
      <div className="weather-meta">
        <span>{data.stationName}{data.obsTime ? ` · as of ${formatCentralTime(data.obsTime)}` : ''}</span>
        <button type="button" className="weather-refresh-btn" onClick={check} title="Refresh">⟳</button>
      </div>
    </div>
  )
}

export default function SiteDetail({ site, onClose, onUpdate, isOnline, pendingCount, canEdit, onPinIconChange, onNotesSave }) {
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState('')
  const [pendingAction, setPendingAction] = useState(null) // null | 'partial' | 'mob' | 'collected'
  const [checkState, setCheckState] = useState('idle')    // 'idle' | 'checking' | 'notFound'
  // Set when the pending 'collected' action is a recollect of a site that was
  // Partial or MOB Fee (as opposed to a fresh collect or a refly) — 'partial' |
  // 'mob' | null. Captured at the moment the pilot taps the button, before
  // status can change, so it's reliable even though the checkbox that told us
  // so gets overwritten by the eventual onUpdate call. Passed through to
  // onUpdate so App.jsx can stamp the site with *which* field it needs to link
  // into on the EOD (Partial Collection vs Mobilization — see handleUpdate in
  // src/App.jsx).
  const [pendingRecollectReason, setPendingRecollectReason] = useState(null)
  // Timestamp captured the moment the pilot taps the button, before the
  // access-form tab even opens — sent to checkAccessIssue so it only counts a
  // form created after this point. Without it, a site already sitting at
  // Partial/MOB (which necessarily already has an access-issue record on file
  // from when it was originally marked) would immediately "pass" the check
  // for a same-day recollect without the pilot submitting a new form at all.
  const [pendingSince, setPendingSince] = useState(null)

  const status = getSiteStatus(site)
  const statusStyle = STATUS_LABELS[status]

  const runCheck = useCallback(async () => {
    if (checkState === 'checking' || !pendingAction) return
    setCheckState('checking')
    try {
      const result = await checkAccessIssue(site.id, pendingSince)
      if (result.exists) {
        setLoading(true)
        try {
          await onUpdate(site.id, pendingAction, pendingRecollectReason ? { recollected: true, recollectReason: pendingRecollectReason } : undefined)
          const label = pendingAction === 'partial' ? 'Partial' : pendingAction === 'mob' ? 'MOB Fee' : 'Collected'
          setPendingAction(null)
          setPendingRecollectReason(null)
          setPendingSince(null)
          setCheckState('idle')
          setToast(`✓ ${label} confirmed`)
          setTimeout(() => setToast(''), 3000)
        } catch (err) {
          setToast('Error: ' + (err.message || 'Try again'))
          setTimeout(() => setToast(''), 4000)
          setCheckState('idle')
        } finally {
          setLoading(false)
        }
      } else {
        setCheckState('notFound')
      }
    } catch {
      setCheckState('notFound')
    }
  }, [checkState, pendingAction, pendingRecollectReason, pendingSince, site.id, onUpdate])

  // Auto-check when pilot switches back to this tab
  useEffect(() => {
    if (!pendingAction) return
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') runCheck()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [pendingAction, runCheck])

  function cancelPending() {
    setPendingAction(null)
    setPendingRecollectReason(null)
    setPendingSince(null)
    setCheckState('idle')
  }

  async function handleAction(action) {
    if (loading || !canEdit) return
    const newAction = action === status ? 'uncollect' : action

    // Refly sites need a completed access form on file before they can be
    // marked Collected too, same requirement Partial/MOB already have — a
    // reflight means the office is re-authorizing access to a site that was
    // previously flagged, so the pilot can't just tap Collected on the strength
    // of whatever access was arranged for the original visit. Same logic
    // applies to a site currently sitting at Partial or MOB Fee: recollecting
    // it means going back for a second visit, so it needs its own fresh access
    // form too, not a ride on whatever access was arranged for the first one.
    // 'partial' | 'mob' | null — which field this recollect needs to link into
    // on the EOD (EOD_PARTIAL_COLLECTION vs EOD_MOBILIZATION), not just whether
    // it was a recollect at all.
    const recollectReason = newAction === 'collected' && (status === 'partial' || status === 'mob') ? status : null
    const needsAccessForm = newAction === 'partial' || newAction === 'mob' ||
      (newAction === 'collected' && needsAccessFormToCollect(site, status))

    if (needsAccessForm) {
      if (!isOnline) {
        setToast(newAction === 'collected'
          ? 'Must be online to submit the access form'
          : 'Must be online to submit Partial or MOB Fee')
        setTimeout(() => setToast(''), 3000)
        return
      }
      // window.open is called synchronously in the button onClick
      setPendingAction(newAction)
      setPendingRecollectReason(recollectReason)
      setPendingSince(new Date().toISOString())
      setCheckState('idle')
      return
    }

    setLoading(true)
    try {
      await onUpdate(site.id, newAction)
      setToast(newAction === 'uncollect' ? 'Cleared' : `Marked as ${STATUS_LABELS[action]?.label || action}`)
      setTimeout(() => setToast(''), 2000)
    } catch (err) {
      setToast('Error: ' + (err.message || 'Try again'))
      setTimeout(() => setToast(''), 3000)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="detail-overlay" onClick={onClose}>
      <div className="detail-sheet" onClick={e => e.stopPropagation()}>
        <div className="detail-handle" />

        <div className="detail-header">
          <div>
            <div className="detail-site-id">{site.siteId || 'Site'}</div>
            <div className="detail-fuze">FUZE: {site.fuzeId || '—'}</div>
          </div>
          <div
            className="status-badge"
            style={{ color: statusStyle.color, background: statusStyle.bg }}
          >
            {statusStyle.label}
          </div>
        </div>

        {site.collectionStatus && (
          <div className="detail-airtable-status">
            Airtable: {site.collectionStatus}
          </div>
        )}

        {isReflySite(site) && (
          <div className="detail-refly-notes">
            🔁 Refly site — access form required before marking Collected.
            {site.reflyNotes ? ` ${site.reflyNotes}` : ''}
          </div>
        )}

        {isReflySite(site) && site.reflyAttachments && site.reflyAttachments.length > 0 && (
          <div className="detail-refly-attachments">
            {site.reflyAttachments.map((att, i) => {
              const isImage = (att.type || '').startsWith('image/')
              return isImage ? (
                <a
                  key={att.id || i}
                  href={att.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="detail-refly-attachment-thumb"
                >
                  <img src={att.thumbnails?.large?.url || att.url} alt={att.filename || 'Refly notice'} />
                </a>
              ) : (
                <a
                  key={att.id || i}
                  href={att.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="detail-refly-attachment-file"
                >
                  📎 {att.filename || `Refly Notice ${i + 1}`}
                </a>
              )
            })}
          </div>
        )}

        {onPinIconChange && (
          <IconPicker value={site.pinIcon} onChange={type => onPinIconChange(site.id, type)} />
        )}

        {onNotesSave && (
          <NotesEditor site={site} onSave={onNotesSave} />
        )}

        <div className="detail-info">
          <InfoRow label="Sub Project" value={site.subProject} />
          <InfoRow label="Address" value={site.address} />
          <InfoRow label="City" value={site.city} />
          <InfoRow label="State" value={site.state} />
          <InfoRow label="Zip" value={site.zip} />
          <InfoRow label="Structure Type" value={site.siteStructureType} />
          <InfoRow label="Structure Owner" value={site.siteStructureOwner} />
          <InfoRow label="Height (ft)" value={site.structureHeight} />
          <InfoRow label="Airport" value={site.airport} />
          <InfoRow label="Airspace" value={site.airspace} />
          <InfoRow label="Latitude" value={site.lat} />
          <InfoRow label="Longitude" value={site.lng} />
          <InfoRow label="Site Issue" value={site.siteIssue} />
          {site.coaAttachments && site.coaAttachments.length > 0 && (
            <div className="info-row">
              <span className="info-label">COA</span>
              <span className="info-value">
                {site.coaAttachments.map((att, i) => (
                  <a
                    key={i}
                    href={att.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'block', color: '#60a5fa', textDecoration: 'underline', wordBreak: 'break-all' }}
                  >
                    {att.filename || `COA File ${i + 1}`}
                  </a>
                ))}
              </span>
            </div>
          )}
          <InfoRow label="Pilot Assigned" value={site.pilotAssigned} />
          <WeatherCheck site={site} />
          <InfoRow label="Map Color" value={site.mapColor} />
          <InfoRow label="Forecast Date" value={site.forecastDate ? formatDateOnly(site.forecastDate) : ''} />
          <InfoRow label="Pre/Post" value={site.prePost} />
          <InfoRow label="Date Added" value={site.dateAdded ? new Date(site.dateAdded).toLocaleDateString() : ''} />
        </div>

        {/* Universal Google Maps link, not the comgooglemaps:// custom scheme —
            this opens the Google Maps app directly if it's installed (iOS and
            Android both honor it as a universal/app link) and falls back to
            Maps in the browser if it's not, with no platform detection needed.
            Always visible regardless of preflight/access-form state below,
            since a pilot may want directions before either of those clears. */}
        {site.lat && site.lng && (
          <a
            className="action-btn navigate"
            href={`https://www.google.com/maps/dir/?api=1&destination=${site.lat},${site.lng}&travelmode=driving`}
            target="_blank"
            rel="noopener noreferrer"
          >
            🧭 GO!
          </a>
        )}

        {!canEdit ? (
          <div className="access-pending">
            <p className="pending-msg">Complete today's preflight before logging site status.</p>
            <div className="pending-btns">
              <button className="btn-check-again" onClick={() => window.open(PREFLIGHT_FORM_URL, '_blank')}>
                Open Preflight Form
              </button>
            </div>
          </div>
        ) : pendingAction ? (
          <div className="access-pending">
            {pendingAction === 'collected' && (
              <p className="pending-msg" style={{ marginBottom: 8 }}>
                {pendingRecollectReason === 'partial'
                  ? '🔁 This site was previously marked Partial — a completed access form is required before it can be marked Collected.'
                  : pendingRecollectReason === 'mob'
                  ? '🔁 This site was previously marked MOB Fee — a completed access form is required before it can be marked Collected.'
                  : '🔁 This is a refly site — a completed access form is required before it can be marked Collected.'}
              </p>
            )}
            {checkState === 'checking' ? (
              <p className="pending-msg">Checking for access form submission...</p>
            ) : checkState === 'notFound' ? (
              <>
                <p className="pending-msg">No access form found yet for this site. Complete the form and come back.</p>
                <div className="pending-btns">
                  <button className="btn-check-again" onClick={runCheck}>Check Again</button>
                  <button className="btn-cancel-pending" onClick={cancelPending}>Cancel</button>
                </div>
              </>
            ) : (
              <>
                <p className="pending-msg">Access form is open. Complete it and return here — the site will be marked automatically.</p>
                <div className="pending-btns">
                  <button className="btn-check-again" onClick={runCheck}>I'm Back — Check Now</button>
                  <button className="btn-cancel-pending" onClick={cancelPending}>Cancel</button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="detail-actions">
            <button
              className={`action-btn collected ${status === 'collected' ? 'active' : ''}`}
              onClick={() => { if (status !== 'collected' && needsAccessFormToCollect(site, status)) window.open(ACCESS_FORM_URL, '_blank'); handleAction('collected') }}
              disabled={loading}
            >
              {/* Label reflects why this tap needs an access form, so a pilot
                  closing out a Partial/MOB/Refly site sees wording that matches
                  what they're looking at instead of a generic "Mark Collected"
                  that reads the same for a brand-new site. Priority when more
                  than one applies (e.g. a refly site that's also sitting at
                  Partial): Refi > Partial > MOB, matching needsAccessFormToCollect's
                  own precedence. Purely a label — the tap does the same thing
                  regardless of which text is showing. */}
              {status === 'collected'
                ? '✓ Collected'
                : isReflySite(site)
                ? 'Re-fly Completed'
                : status === 'partial'
                ? 'Partial Completed'
                : status === 'mob'
                ? 'MOB Completed'
                : 'Mark Collected'}
            </button>
            <div className="action-row-2">
              <button
                className={`action-btn partial ${status === 'partial' ? 'active' : ''}`}
                onClick={() => { if (status !== 'partial') window.open(ACCESS_FORM_URL, '_blank'); handleAction('partial') }}
                disabled={loading}
              >
                {status === 'partial' ? '✓ Partial' : 'Partial'}
              </button>
              <button
                className={`action-btn mob ${status === 'mob' ? 'active' : ''}`}
                onClick={() => { if (status !== 'mob') window.open(ACCESS_FORM_URL, '_blank'); handleAction('mob') }}
                disabled={loading}
              >
                {status === 'mob' ? '✓ MOB Fee' : 'MOB Fee'}
              </button>
            </div>
          </div>
        )}

        {!isOnline && (
          <div className="offline-badge">
            Offline — update queued ({pendingCount} pending)
          </div>
        )}

        {toast && <div className="toast">{toast}</div>}

        <button className="detail-close" onClick={onClose}>Close</button>
      </div>
    </div>
  )
}

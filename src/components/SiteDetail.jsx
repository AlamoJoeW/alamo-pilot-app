import { useState, useEffect, useCallback } from 'react'
import { checkAccessIssue } from '../utils/api'

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

// Same check used in SiteList.jsx / MapView.jsx — a site counts as "needs a
// reflight" from either the office REFLY checkbox or the Map Color already
// flagging it.
function isReflySite(site) {
  return !!site.refly || site.mapColor === 'Refly' || site.mapColor === 'Refly Further Coordination Required'
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

export default function SiteDetail({ site, onClose, onUpdate, isOnline, pendingCount, canEdit, onPinIconChange, onNotesSave }) {
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState('')
  const [pendingAction, setPendingAction] = useState(null) // null | 'partial' | 'mob'
  const [checkState, setCheckState] = useState('idle')    // 'idle' | 'checking' | 'notFound'

  const status = getSiteStatus(site)
  const statusStyle = STATUS_LABELS[status]

  const runCheck = useCallback(async () => {
    if (checkState === 'checking' || !pendingAction) return
    setCheckState('checking')
    try {
      const result = await checkAccessIssue(site.id)
      if (result.exists) {
        setLoading(true)
        try {
          await onUpdate(site.id, pendingAction)
          const label = pendingAction === 'partial' ? 'Partial' : 'MOB Fee'
          setPendingAction(null)
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
  }, [checkState, pendingAction, site.id, onUpdate])

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
    setCheckState('idle')
  }

  async function handleAction(action) {
    if (loading || !canEdit) return
    const newAction = action === status ? 'uncollect' : action

    if (newAction === 'partial' || newAction === 'mob') {
      if (!isOnline) {
        setToast('Must be online to submit Partial or MOB Fee')
        setTimeout(() => setToast(''), 3000)
        return
      }
      // window.open is called synchronously in the button onClick
      setPendingAction(newAction)
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

        {isReflySite(site) && site.reflyNotes && (
          <div className="detail-refly-notes">🔁 Refly: {site.reflyNotes}</div>
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
          <InfoRow label="Map Color" value={site.mapColor} />
          <InfoRow label="Date Added" value={site.dateAdded ? new Date(site.dateAdded).toLocaleDateString() : ''} />
        </div>

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
              onClick={() => handleAction('collected')}
              disabled={loading}
            >
              {status === 'collected' ? '✓ Collected' : 'Mark Collected'}
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

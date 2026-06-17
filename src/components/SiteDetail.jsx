import { useState } from 'react'
import { submitAccessIssue } from '../utils/api'

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

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function AccessIssueModal({ action, onSubmit, onCancel, submitting }) {
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState(null)
  const [fileLoading, setFileLoading] = useState(false)
  const label = action === 'partial' ? 'Partial Collection' : 'MOB Fee'

  async function handleFileChange(e) {
    const f = e.target.files[0]
    if (!f) return
    setFileLoading(true)
    try {
      const base64 = await fileToBase64(f)
      setFile({ base64, name: f.name, type: f.type })
    } catch {
      // ignore
    } finally {
      setFileLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal access-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{label}</span>
          <span className="modal-required-badge">Required</span>
        </div>
        <p className="modal-desc">
          Describe why this site couldn't be fully collected. Attach the access issues form if available.
        </p>

        <label className="field-label">Reason *</label>
        <textarea
          className="notes-textarea"
          placeholder="e.g. Gate was locked, no access code on file..."
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={4}
          autoFocus
          disabled={submitting}
        />

        <label className="field-label">Attachment (optional)</label>
        <label className={`file-pick-btn ${file ? 'file-attached' : ''}`}>
          {fileLoading ? '⏳ Processing...' : file ? `✓ ${file.name}` : '📎 Add Photo or File'}
          <input
            type="file"
            accept="image/*,application/pdf"
            style={{ display: 'none' }}
            onChange={handleFileChange}
            disabled={submitting || fileLoading}
          />
        </label>

        <div className="modal-actions">
          <button className="btn-modal-cancel" onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
          <button
            className="btn-modal-confirm"
            onClick={() => onSubmit(notes, file)}
            disabled={!notes.trim() || submitting || fileLoading}
          >
            {submitting ? 'Submitting...' : `Submit ${label}`}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function SiteDetail({ site, onClose, onUpdate, isOnline, pendingCount, inEodQueue, onEodToggle }) {
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState('')
  const [showAccessModal, setShowAccessModal] = useState(null) // null | 'partial' | 'mob'
  const status = getSiteStatus(site)
  const statusStyle = STATUS_LABELS[status]
  const hasStatus = status !== 'none'

  async function handleAction(action) {
    if (loading) return
    const newAction = action === status ? 'uncollect' : action

    // Partial and MOB require online + access issue form
    if (newAction === 'partial' || newAction === 'mob') {
      if (!isOnline) {
        setToast('Must be online to submit Partial or MOB Fee')
        setTimeout(() => setToast(''), 3000)
        return
      }
      setShowAccessModal(newAction)
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

  async function handleAccessIssueSubmit(notes, file) {
    const action = showAccessModal
    setLoading(true)
    try {
      await submitAccessIssue(site.id, action, notes, file)
      await onUpdate(site.id, action)
      setShowAccessModal(null)
      const label = action === 'partial' ? 'Partial' : 'MOB Fee'
      setToast(`✓ ${label} — access issue filed`)
      setTimeout(() => setToast(''), 3000)
    } catch (err) {
      setToast('Error: ' + (err.message || 'Try again'))
      setTimeout(() => setToast(''), 4000)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="detail-overlay" onClick={onClose}>
      <div className="detail-sheet" onClick={e => e.stopPropagation()}>
        <div className="detail-handle" />

        {/* Header */}
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

        {/* Collection status from Airtable formula */}
        {site.collectionStatus && (
          <div className="detail-airtable-status">
            Airtable: {site.collectionStatus}
          </div>
        )}

        {/* All pilot CSV fields */}
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
          <InfoRow label="Pilot Assigned" value={site.pilotAssigned} />
          <InfoRow label="Map Color" value={site.mapColor} />
          <InfoRow label="Date Added" value={site.dateAdded ? new Date(site.dateAdded).toLocaleDateString() : ''} />
        </div>

        {/* Action buttons */}
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
              onClick={() => handleAction('partial')}
              disabled={loading}
            >
              {status === 'partial' ? '✓ Partial' : 'Partial'}
            </button>
            <button
              className={`action-btn mob ${status === 'mob' ? 'active' : ''}`}
              onClick={() => handleAction('mob')}
              disabled={loading}
            >
              {status === 'mob' ? '✓ MOB Fee' : 'MOB Fee'}
            </button>
          </div>
        </div>

        {/* EOD queue toggle — only shown when site has a status */}
        {hasStatus && onEodToggle && (
          <button
            className={'action-btn eod-toggle ' + (inEodQueue ? 'eod-queued' : '')}
            onClick={() => onEodToggle(site.id)}
            style={{
              marginTop: '10px',
              width: '100%',
              background: inEodQueue ? '#166534' : 'transparent',
              color: inEodQueue ? '#86efac' : '#64748b',
              border: '1px solid ' + (inEodQueue ? '#166534' : '#334155'),
            }}
          >
            {inEodQueue ? '✓ In EOD — tap to remove' : '+ Add to EOD'}
          </button>
        )}

        {!isOnline && (
          <div className="offline-badge">
            Offline — update queued ({pendingCount} pending)
          </div>
        )}

        {toast && <div className="toast">{toast}</div>}

        <button className="detail-close" onClick={onClose}>Close</button>
      </div>

      {/* Access Issue Modal */}
      {showAccessModal && (
        <AccessIssueModal
          action={showAccessModal}
          onSubmit={handleAccessIssueSubmit}
          onCancel={() => !loading && setShowAccessModal(null)}
          submitting={loading}
        />
      )}
    </div>
  )
      }

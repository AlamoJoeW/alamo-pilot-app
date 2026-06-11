import { useState } from 'react'

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

export default function SiteDetail({ site, onClose, onUpdate, isOnline, pendingCount }) {
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState('')
  const status = getSiteStatus(site)
  const statusStyle = STATUS_LABELS[status]

  async function handleAction(action) {
    if (loading) return
    // If same action, treat as un-collect
    const newAction = action === status ? 'uncollect' : action
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

import { statusBucketForSite, colorForMapColor } from '../utils/mapColors'
import { NotesEditor, WeatherCheck } from './SiteDetail'

// Site detail sheet for the Admin view — same visual language as the
// pilot-facing SiteDetail, no status action buttons and no preflight gating
// (admins can't mark sites Collected/Partial/MOB from here), but Notes are
// editable — same field/save path as the pilot app's NotesEditor, wired up
// from AdminView's onNotesSave.

const BUCKET_LABELS = {
  collected: { label: 'Collected', color: '#22c55e', bg: '#052e16' },
  partial: { label: 'Partial', color: '#facc15', bg: '#2d2006' },
  mob: { label: 'MOB Fee', color: '#f97316', bg: '#2c1003' },
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

// Same check used in SiteList.jsx / MapView.jsx / SiteDetail.jsx.
function isReflySite(site) {
  return !!site.refly || site.mapColor === 'Refly' || site.mapColor === 'Refly Further Coordination Required'
}

export default function AdminSiteDetail({ site, onClose, onNotesSave }) {
  if (!site) return null

  const bucket = statusBucketForSite(site)
  const badge = bucket
    ? BUCKET_LABELS[bucket]
    : { label: 'Not Collected', color: '#94a3b8', bg: '#1e293b' }
  const mapColorHex = colorForMapColor(site.mapColor)

  return (
    <div className="detail-overlay" onClick={onClose}>
      <div className="detail-sheet" onClick={e => e.stopPropagation()}>
        <div className="detail-handle" />

        <div className="detail-header">
          <div>
            <div className="detail-site-id">{site.siteId || 'Site'}</div>
            <div className="detail-fuze">FUZE: {site.fuzeId || '—'}</div>
          </div>
          <div className="status-badge" style={{ color: badge.color, background: badge.bg }}>
            {badge.label}
          </div>
        </div>

        <WeatherCheck site={site} />

        {site.mapColor && (
          <div className="detail-airtable-status" style={{ color: mapColorHex || undefined }}>
            Map Color: {site.mapColor}
          </div>
        )}
        {site.collectionStatus && (
          <div className="detail-airtable-status">
            Airtable: {site.collectionStatus}
          </div>
        )}

        {isReflySite(site) && site.reflyNotes && (
          <div className="detail-refly-notes">🔁 Refly: {site.reflyNotes}</div>
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

        {onNotesSave ? (
          <NotesEditor site={site} onSave={onNotesSave} />
        ) : site.notes && (
          <div className="detail-notes">
            <div className="detail-notes-label">Notes</div>
            <div className="detail-notes-view has-note" style={{ cursor: 'default' }}>{site.notes}</div>
          </div>
        )}

        <div className="detail-info">
          <InfoRow label="Assigned Pilot(s)" value={(site.pilotNames || []).join(', ')} />
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
          <InfoRow label="Pilot Assigned (legacy field)" value={site.pilotAssigned} />
          <InfoRow label="Date Added" value={site.dateAdded ? new Date(site.dateAdded).toLocaleDateString() : ''} />
        </div>

        <button className="detail-close" onClick={onClose}>Close</button>
      </div>
    </div>
  )
}

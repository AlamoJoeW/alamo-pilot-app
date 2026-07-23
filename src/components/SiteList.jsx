import { statusBucketForSite } from '../utils/mapColors'

const STATUS_COLORS = {
  collected: '#22c55e',
  partial: '#facc15',
  mob: '#f97316',
  none: '#475569',
}

// Map Color (office-maintained status) wins when unambiguous; falls back to the
// pilot's own Collected/Partial/MOB checkboxes otherwise. Keeps the List view's
// counts and dots consistent with the progress bar and the Map/Admin pins.
function getSiteStatus(site) {
  return statusBucketForSite(site) || 'none'
}

function statusLabel(s) {
  if (s === 'collected') return 'Collected'
  if (s === 'partial') return 'Partial'
  if (s === 'mob') return 'MOB Fee'
  return 'Pending'
}

export default function SiteList({ sites, onSelect, filter, onFilterChange }) {
  const filtered = sites.filter(s => {
    if (filter === 'all') return true
    return getSiteStatus(s) === filter
  })

  const counts = {
    all: sites.length,
    none: sites.filter(s => getSiteStatus(s) === 'none').length,
    collected: sites.filter(s => getSiteStatus(s) === 'collected').length,
    partial: sites.filter(s => getSiteStatus(s) === 'partial').length,
    mob: sites.filter(s => getSiteStatus(s) === 'mob').length,
  }

  return (
    <div className="site-list-container">
      {/* Filter tabs */}
      <div className="filter-tabs">
        {[
          { key: 'all', label: `All (${counts.all})` },
          { key: 'none', label: `Pending (${counts.none})` },
          { key: 'collected', label: `Done (${counts.collected})` },
          { key: 'partial', label: `Partial (${counts.partial})` },
          { key: 'mob', label: `MOB (${counts.mob})` },
        ].map(f => (
          <button
            key={f.key}
            className={`filter-tab ${filter === f.key ? 'active' : ''}`}
            onClick={() => onFilterChange(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Site rows */}
      <div className="site-list">
        {filtered.length === 0 && (
          <div className="empty-state">No sites in this category</div>
        )}
        {filtered.map(site => {
          const s = getSiteStatus(site)
          return (
            <div key={site.id} className="site-row" onClick={() => onSelect(site)}>
              <div
                className="status-dot"
                style={{ background: STATUS_COLORS[s] }}
              />
              <div className="site-row-info">
                <div className="site-row-id">{site.siteId || '—'}</div>
                <div className="site-row-sub">
                  FUZE: {site.fuzeId || '—'} · {site.city || site.state || site.subProject || '—'}
                </div>
              </div>
              <div
                className="site-row-status"
                style={{ color: STATUS_COLORS[s] }}
              >
                {statusLabel(s)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

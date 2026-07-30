import { useState } from 'react'
import { statusBucketForSite, isReflySite } from '../utils/mapColors'
import { sortSites, SORT_OPTIONS } from '../utils/sortSites'

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

// Bulk select only ever marks Collected — Partial and MOB Fee require an
// access form on file (checked per-site in SiteDetail's single-site flow),
// so those stay single-site-only rather than risking a pilot bulk-marking
// sites that don't have one. Refly sites now have that same access-form
// requirement for Collected too (see SiteDetail.jsx / runBulkAction below) —
// same reasoning, single-site-only.
const BULK_ACTIONS = [
  { action: 'collected', label: 'Mark Collected' },
]

function NotesRow({ site, onSave }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(site.notes || '')
  const [saving, setSaving] = useState(false)

  if (!editing) {
    return (
      <button
        type="button"
        className={`site-row-notes-btn-full ${site.notes ? 'has-note' : ''}`}
        onClick={e => { e.stopPropagation(); setValue(site.notes || ''); setEditing(true) }}
      >
        <span className="site-row-notes-icon">✏️</span>
        {site.notes
          ? <span className="site-row-notes-text">{site.notes}</span>
          : <span className="site-row-notes-placeholder">Add note</span>}
      </button>
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
    <div className="site-row-notes site-row-notes-editing" onClick={e => e.stopPropagation()}>
      <input
        className="site-row-notes-input"
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="Add a note for this site…"
        autoFocus
        disabled={saving}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
      />
      <button className="site-row-notes-btn" onClick={save} disabled={saving}>{saving ? '…' : '✓'}</button>
      <button className="site-row-notes-btn" onClick={() => setEditing(false)} disabled={saving}>✕</button>
    </div>
  )
}

// Fields a pilot might actually search by — site ID and FUZE ID are the two
// they'd have written down or been told over the phone; city/state/sub
// project cover "what's around Fairport" style lookups.
function matchesSearch(site, query) {
  const haystack = [site.siteId, site.fuzeId, site.city, site.state, site.subProject, site.address]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return haystack.includes(query)
}

export default function SiteList({ sites, onSelect, filter, onFilterChange, onBulkUpdate, onNotesSave, canEdit, isOnline }) {
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkMessage, setBulkMessage] = useState('')
  const [sortKey, setSortKey] = useState('siteId')
  const [search, setSearch] = useState('')

  // Search narrows within whatever status tab is selected — it doesn't touch
  // the tab counts below, same as how the tabs themselves don't reset search.
  const trimmedQuery = search.trim().toLowerCase()
  const filtered = sortSites(
    sites.filter(s => {
      if (filter !== 'all' && getSiteStatus(s) !== filter) return false
      if (trimmedQuery && !matchesSearch(s, trimmedQuery)) return false
      return true
    }),
    sortKey
  )

  const counts = {
    all: sites.length,
    none: sites.filter(s => getSiteStatus(s) === 'none').length,
    collected: sites.filter(s => getSiteStatus(s) === 'collected').length,
    partial: sites.filter(s => getSiteStatus(s) === 'partial').length,
    mob: sites.filter(s => getSiteStatus(s) === 'mob').length,
  }

  function toggleSelectMode() {
    setSelectMode(v => !v)
    setSelectedIds(new Set())
    setBulkMessage('')
  }

  function toggleSelected(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleRowClick(site) {
    if (selectMode) {
      toggleSelected(site.id)
    } else {
      onSelect(site)
    }
  }

  async function runBulkAction(action) {
    if (bulkBusy || selectedIds.size === 0 || !onBulkUpdate) return

    setBulkBusy(true)
    setBulkMessage('')
    try {
      const ids = Array.from(selectedIds)

      // Refly sites require a completed access form before they can be marked
      // Collected (mandatory, same as Partial/MOB) — that confirmation flow
      // only exists in SiteDetail's single-site path, so keep refly sites out
      // of the bulk action rather than silently skipping the requirement.
      let targetIds = ids
      let skippedRefly = 0
      if (action === 'collected') {
        const reflyIds = new Set(sites.filter(isReflySite).map(s => s.id))
        targetIds = ids.filter(id => !reflyIds.has(id))
        skippedRefly = ids.length - targetIds.length
      }

      if (targetIds.length > 0) {
        await onBulkUpdate(targetIds, action)
      }

      const label = BULK_ACTIONS.find(a => a.action === action)?.label || action
      const parts = []
      if (targetIds.length > 0) parts.push(`${targetIds.length} site${targetIds.length !== 1 ? 's' : ''} ${label.toLowerCase()}.`)
      if (skippedRefly > 0) parts.push(`${skippedRefly} refly site${skippedRefly !== 1 ? 's' : ''} skipped — mark individually (access form required).`)
      setBulkMessage(parts.join(' ') || 'No sites updated.')
      setSelectedIds(new Set())
    } catch (err) {
      setBulkMessage('Error: ' + (err.message || 'Bulk update failed'))
    } finally {
      setBulkBusy(false)
    }
  }

  return (
    <div className="site-list-container">
      {/* Search */}
      <div className="site-search-row">
        <input
          type="text"
          inputMode="search"
          className="site-search-input"
          placeholder="Search site ID, FUZE, city…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button
            type="button"
            className="site-search-clear"
            onClick={() => setSearch('')}
            aria-label="Clear search"
          >
            ✕
          </button>
        )}
      </div>

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
        {canEdit && (
          <button
            className={`filter-tab select-mode-toggle ${selectMode ? 'active' : ''}`}
            onClick={toggleSelectMode}
            title="Select multiple sites to mark at once"
          >
            {selectMode ? 'Cancel' : 'Select'}
          </button>
        )}
        <select
          className="sort-select"
          value={sortKey}
          onChange={e => setSortKey(e.target.value)}
          title="Sort sites"
          aria-label="Sort sites"
        >
          {SORT_OPTIONS.map(o => (
            <option key={o.key} value={o.key}>Sort: {o.label}</option>
          ))}
        </select>
      </div>

      {selectMode && (
        <div className="bulk-action-bar">
          <span className="bulk-action-count">{selectedIds.size} selected</span>
          <div className="bulk-action-btns">
            {BULK_ACTIONS.map(a => (
              <button
                key={a.action}
                className="bulk-action-btn"
                onClick={() => runBulkAction(a.action)}
                disabled={bulkBusy || selectedIds.size === 0}
              >
                {a.label}
              </button>
            ))}
          </div>
          {bulkMessage && <div className="bulk-action-message">{bulkMessage}</div>}
        </div>
      )}

      {/* Site rows */}
      <div className="site-list">
        {filtered.length === 0 && (
          <div className="empty-state">
            {trimmedQuery ? 'No sites match your search' : 'No sites in this category'}
          </div>
        )}
        {filtered.map(site => {
          const s = getSiteStatus(site)
          const refly = isReflySite(site)
          return (
            <div key={site.id} className="site-row-wrapper">
              <div
                className={`site-row ${selectMode && selectedIds.has(site.id) ? 'site-row-selected' : ''}`}
                onClick={() => handleRowClick(site)}
              >
                {selectMode && (
                  <input
                    type="checkbox"
                    className="site-row-checkbox"
                    checked={selectedIds.has(site.id)}
                    onChange={() => toggleSelected(site.id)}
                    onClick={e => e.stopPropagation()}
                  />
                )}
                <div
                  className="status-dot"
                  style={{ background: STATUS_COLORS[s] }}
                />
                <div className="site-row-info">
                  <div className="site-row-id">{site.siteId || '—'}</div>
                  <div className="site-row-sub">
                    FUZE: {site.fuzeId || '—'} · {site.city || site.state || site.subProject || '—'}
                  </div>
                  {refly && site.reflyNotes && (
                    <div className="site-row-refly-notes">🔁 {site.reflyNotes}</div>
                  )}
                </div>
                <div
                  className="site-row-status"
                  style={{ color: STATUS_COLORS[s] }}
                >
                  {statusLabel(s)}
                </div>
              </div>
              {!selectMode && onNotesSave && (
                <NotesRow site={site} onSave={onNotesSave} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

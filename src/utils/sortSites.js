// Shared "Sort by" logic for the pilot List view (SiteList.jsx) and the Admin
// List view (AdminView.jsx) — keeps the dropdown options and behavior
// identical in both places instead of drifting apart.

import { statusBucketForSite } from './mapColors'

// Workflow order: not started → partially done → MOB fee only → fully collected.
const STATUS_ORDER = { none: 0, partial: 1, mob: 2, collected: 3 }

function statusRank(site) {
  return STATUS_ORDER[statusBucketForSite(site) || 'none']
}

function siteIdCompare(a, b) {
  return (a.siteId || '').localeCompare(b.siteId || '', undefined, { numeric: true, sensitivity: 'base' })
}

function cityStateCompare(a, b) {
  const aKey = `${a.city || ''} ${a.state || ''}`.trim()
  const bKey = `${b.city || ''} ${b.state || ''}`.trim()
  return aKey.localeCompare(bKey) || siteIdCompare(a, b)
}

// Most recently marked/updated first. Sites with no "App Status Set At" ever
// recorded sink to the bottom rather than sorting to the top as epoch-0.
function recentCompare(a, b) {
  const aTime = a.appStatusUpdatedAt ? new Date(a.appStatusUpdatedAt).getTime() : -Infinity
  const bTime = b.appStatusUpdatedAt ? new Date(b.appStatusUpdatedAt).getTime() : -Infinity
  return bTime - aTime
}

export const SORT_OPTIONS = [
  { key: 'siteId', label: 'Site ID' },
  { key: 'status', label: 'Status' },
  { key: 'city', label: 'City/State' },
  { key: 'recent', label: 'Recently updated' },
]

export function sortSites(sites, sortKey) {
  const copy = [...sites]
  switch (sortKey) {
    case 'status':
      copy.sort((a, b) => statusRank(a) - statusRank(b) || siteIdCompare(a, b))
      break
    case 'city':
      copy.sort(cityStateCompare)
      break
    case 'recent':
      copy.sort(recentCompare)
      break
    case 'siteId':
    default:
      copy.sort(siteIdCompare)
  }
  return copy
}

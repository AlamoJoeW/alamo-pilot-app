// Fields a pilot or admin might actually search a site by — Site ID and FUZE
// ID are the two they'd have written down or been told over the phone;
// city/state/sub project/address cover "what's around Fairport" style
// lookups. Shared by SiteList's list-narrowing search and MapView/AdminView's
// map search-and-zoom box so "search" means the same thing everywhere in the
// app.
export function matchesSearch(site, query) {
  const haystack = [site.siteId, site.fuzeId, site.city, site.state, site.subProject, site.address]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return haystack.includes(query)
}

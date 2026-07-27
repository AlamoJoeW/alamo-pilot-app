import { openDB } from 'idb'

const DB_NAME = 'alamo-pilot'
const DB_VERSION = 2

let _db = null

async function getDB() {
  if (_db) return _db
  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('sites')) {
        db.createObjectStore('sites', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('pendingUpdates')) {
        db.createObjectStore('pendingUpdates', { autoIncrement: true })
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta')
      }
      // Per-device pin icon preference (building/tower/SBA/COA/LAANC/default), keyed
      // by site record ID. This is purely a local display preference — never synced
      // to Airtable, never shown to other pilots/admin. Deliberately left out of
      // clearAll() below so it survives logout (it's tied to the device, not the
      // logged-in pilot).
      if (!db.objectStoreNames.contains('iconPrefs')) {
        db.createObjectStore('iconPrefs')
      }
    },
  })
  return _db
}

export async function saveSites(sites) {
  const db = await getDB()
  const tx = db.transaction('sites', 'readwrite')
  await Promise.all(sites.map(s => tx.store.put(s)))
  await tx.done
  await setMeta('syncedAt', new Date().toISOString())
}

export async function getSites() {
  const db = await getDB()
  return db.getAll('sites')
}

export async function updateSiteLocally(id, changes) {
  const db = await getDB()
  const site = await db.get('sites', id)
  if (site) {
    await db.put('sites', { ...site, ...changes })
  }
}

export async function queueUpdate(update) {
  const db = await getDB()
  await db.add('pendingUpdates', { ...update, queuedAt: Date.now() })
}

export async function getPendingUpdates() {
  const db = await getDB()
  const all = []
  const tx = db.transaction('pendingUpdates', 'readonly')
  let cursor = await tx.store.openCursor()
  while (cursor) {
    all.push({ key: cursor.key, value: cursor.value })
    cursor = await cursor.continue()
  }
  return all
}

export async function deletePendingUpdate(key) {
  const db = await getDB()
  await db.delete('pendingUpdates', key)
}

export async function setMeta(key, value) {
  const db = await getDB()
  await db.put('meta', value, key)
}

export async function getMeta(key) {
  const db = await getDB()
  return db.get('meta', key)
}

export async function clearAll() {
  const db = await getDB()
  await db.clear('sites')
  await db.clear('pendingUpdates')
  await db.clear('meta')
  // iconPrefs intentionally NOT cleared — see comment in getDB()
}

// ── Per-device pin icon preference ──────────────────────────────────────────
// Local-only: which icon shape (building/tower/sba/coa/laanc, or unset for the
// default colored dot) a pilot has chosen for a given site, on this device.

export async function setIconPref(siteId, iconType) {
  const db = await getDB()
  if (!iconType) {
    await db.delete('iconPrefs', siteId)
  } else {
    await db.put('iconPrefs', iconType, siteId)
  }
}

export async function getIconPref(siteId) {
  const db = await getDB()
  return db.get('iconPrefs', siteId)
}

// Bulk-load every saved preference once (e.g. on app mount) instead of awaiting
// a DB read per marker when redrawing the map.
export async function getAllIconPrefs() {
  const db = await getDB()
  const result = {}
  const tx = db.transaction('iconPrefs', 'readonly')
  let cursor = await tx.store.openCursor()
  while (cursor) {
    result[cursor.key] = cursor.value
    cursor = await cursor.continue()
  }
  return result
}

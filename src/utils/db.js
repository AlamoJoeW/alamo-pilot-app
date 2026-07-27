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
      // Deprecated: pin icon was briefly a per-device-only preference store here.
      // It's now the synced "App Pin Icon" Airtable field (see api/_airtable.js
      // FIELDS.PIN_ICON) instead, so site.pinIcon travels with the site record
      // through the normal sites store below. Store kept (unused) so existing
      // installs don't need a migration; nothing reads/writes it anymore.
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
  // iconPrefs intentionally left alone — unused/deprecated, see comment in getDB()
}

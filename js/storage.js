const DB_NAME = 'fiyattakip';
const DB_VERSION = 1;
const STORE = 'opportunities';

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt');
        store.createIndex('roi', 'roi');
        store.createIndex('profit', 'profit');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    const request = fn(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => reject(tx.error);
  });
}

function prepareRecord(opportunity, now = new Date().toISOString()) {
  return {
    ...opportunity,
    id: opportunity.id || crypto.randomUUID(),
    createdAt: opportunity.createdAt || now,
    updatedAt: now
  };
}

export async function saveOpportunity(opportunity) {
  const record = prepareRecord(opportunity);
  await withStore('readwrite', store => store.put(record));
  return record;
}

export async function saveOpportunities(opportunities) {
  const list = Array.isArray(opportunities) ? opportunities : [];
  if (!list.length) return [];

  const db = await openDb();
  const now = new Date().toISOString();
  const records = list.map(opportunity => prepareRecord(opportunity, now));

  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    records.forEach(record => store.put(record));
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Toplu kayıt işlemi iptal edildi.'));
  });

  db.close();
  return records;
}

export async function listOpportunities() {
  const records = await withStore('readonly', store => store.getAll());
  return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function deleteOpportunity(id) {
  await withStore('readwrite', store => store.delete(id));
}

export async function clearOpportunities() {
  await withStore('readwrite', store => store.clear());
}

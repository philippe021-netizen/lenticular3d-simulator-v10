const DB_NAME = 'microplayer-pixverse-v3';
const STORE_NAME = 'jobs';

function indexedDbAdapter() {
  if (typeof indexedDB === 'undefined') throw new Error('IndexedDB indisponible.');
  const dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return {
    async get(key) {
      const db = await dbPromise;
      return new Promise((resolve, reject) => {
        const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => reject(request.error);
      });
    },
    async set(key, value) {
      const db = await dbPromise;
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }
  };
}

export function createPixVerseJobStore(adapter = indexedDbAdapter()) {
  return {
    save: job => adapter.set('active-job', structuredClone(job)),
    async loadActive() {
      const job = await adapter.get('active-job');
      return job?.status === 'processing' || job?.status === 'created' ? job : null;
    },
    complete: result => adapter.set('active-job', { ...structuredClone(result), status: 'done' }),
    getGuideMediaId: hash => adapter.get(`guide:${hash}`),
    putGuideMediaId: (hash, mediaId) => adapter.set(`guide:${hash}`, Number(mediaId))
  };
}

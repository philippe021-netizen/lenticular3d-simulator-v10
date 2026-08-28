const DB_NAME = 'happyholo-actions';
const DB_VERSION = 1;
const STORE = 'library';
const KEY = 'current';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadActionLibrary() {
  const saved = await idbGet();
  if (saved) return saved;
  const r = await fetch('./data/actions-library.json', { cache: 'no-store' });
  if (!r.ok) throw new Error('Bibliothèque d’actions introuvable.');
  const library = await r.json();
  await idbSet(library);
  return library;
}

export async function saveActionLibrary(library) {
  const copy = structuredClone(library);
  copy.lastUpdated = new Date().toISOString();
  await idbSet(copy);
  return copy;
}

export async function resetActionLibraryToBundled() {
  const r = await fetch('./data/actions-library.json', { cache: 'no-store' });
  if (!r.ok) throw new Error('Bibliothèque intégrée introuvable.');
  const library = await r.json();
  await idbSet(library);
  return library;
}

export function getActionVariant(library, actionId, family = null, variantId = null) {
  const action = library?.actions?.find(a => a.id === actionId && a.active !== false);
  if (!action) throw new Error(`Action inconnue : ${actionId}`);
  let variant = null;
  if (variantId) variant = action.variants?.find(v => v.id === variantId);
  if (!variant && family) variant = action.variants?.find(v => v.family === family);
  if (!variant) variant = action.variants?.find(v => v.id === action.defaultVariantId) || action.variants?.[0];
  if (!variant) throw new Error(`Aucune variante pour ${actionId}`);
  return { action, variant };
}

export function exportActionLibrary(library) {
  const blob = new Blob([JSON.stringify(library, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `happyholo-actions-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function importActionLibrary(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);
  if (!parsed || !Array.isArray(parsed.actions)) throw new Error('Fichier d’actions invalide.');
  return saveActionLibrary(parsed);
}

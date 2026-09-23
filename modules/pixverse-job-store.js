const PREFIX = 'microplayer.pixverse.v3.job.';
const VERSION = 1;

function storageOrNull(storage) {
  if (storage) return storage;
  try { return typeof localStorage !== 'undefined' ? localStorage : null; }
  catch { return null; }
}

export function savePixVerseJob(job, storage) {
  const s = storageOrNull(storage);
  if (!s) return false;
  const id = String(job?.id || job?.videoId || '').trim();
  if (!id) throw new Error('Identifiant de job PixVerse manquant.');
  const payload = { version: VERSION, savedAt: Date.now(), ...job, id };
  s.setItem(PREFIX + id, JSON.stringify(payload));
  s.setItem(PREFIX + 'latest', id);
  return true;
}

export function loadPixVerseJob(id, storage) {
  const s = storageOrNull(storage);
  if (!s) return null;
  const resolvedId = String(id || s.getItem(PREFIX + 'latest') || '').trim();
  if (!resolvedId) return null;
  const raw = s.getItem(PREFIX + resolvedId);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed?.version === VERSION ? parsed : null;
  } catch { return null; }
}

export function clearPixVerseJob(id, storage) {
  const s = storageOrNull(storage);
  if (!s) return false;
  const resolvedId = String(id || '').trim();
  if (!resolvedId) return false;
  s.removeItem(PREFIX + resolvedId);
  if (s.getItem(PREFIX + 'latest') === resolvedId) s.removeItem(PREFIX + 'latest');
  return true;
}

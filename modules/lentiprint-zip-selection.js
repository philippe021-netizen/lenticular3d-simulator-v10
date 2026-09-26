const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;
const DECOY = /(?:^|[\/_-])(preview|montage|contact[-_ ]?sheet|depth(?:[-_ ]?map)?|masks?|alpha|thumbnail|thumb|composite|simulator|groupe?)(?:[\/_-]|\.)/i;

function pathOf(entry) {
  return String(entry?.name || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function basename(path) {
  return path.split('/').filter(Boolean).pop() || '';
}

function viewNumber(path) {
  const name = basename(path);
  if (!IMAGE_EXT.test(name) || DECOY.test(path)) return null;
  const stem = name.replace(IMAGE_EXT, '');
  const match = stem.match(/(?:^|[-_ ])(?:view|vue)?[-_ ]*0?([1-9])(?:[-_ ][^0-9].*)?$/i)
    || stem.match(/^0?([1-9])$/);
  return match ? Number(match[1]) : null;
}

function naturalCompare(a, b) {
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

function fromManifest(entries, manifest) {
  const listed = Array.isArray(manifest?.view_files) ? manifest.view_files
    : Array.isArray(manifest?.views) ? manifest.views.map(view => view?.file || view?.name)
      : Array.isArray(manifest?.render?.views) ? manifest.render.views.map(view => view?.file || view?.name)
        : [];
  if (listed.length !== 9 || listed.some(value => typeof value !== 'string' || !value)) return null;
  const byPath = new Map(entries.map(entry => [pathOf(entry).toLowerCase(), entry]));
  const resolved = [];
  for (const value of listed) {
    const wanted = String(value).replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
    let found = byPath.get(wanted);
    if (!found) {
      const matches = entries.filter(entry => basename(pathOf(entry)).toLowerCase() === basename(wanted));
      if (matches.length !== 1) return null;
      [found] = matches;
    }
    resolved.push(found);
  }
  return new Set(resolved).size === 9 ? resolved : null;
}

function directory(path) {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i + 1).toLowerCase();
}

function directoryRank(dir) {
  if (/^sources\//i.test(dir)) return 0;
  if (/^views\//i.test(dir)) return 1;
  if (!dir) return 3;
  return 2;
}

export function selectNineViewEntries(allEntries, manifest = null) {
  const entries = (allEntries || []).filter(entry => entry && !entry.dir && IMAGE_EXT.test(pathOf(entry)));
  const manifested = fromManifest(entries, manifest);
  if (manifested) return manifested;

  const groups = new Map();
  for (const entry of entries) {
    const path = pathOf(entry);
    const index = viewNumber(path);
    if (!index) continue;
    const dir = directory(path);
    if (!groups.has(dir)) groups.set(dir, new Map());
    const byIndex = groups.get(dir);
    if (!byIndex.has(index)) byIndex.set(index, []);
    byIndex.get(index).push(entry);
  }
  const complete = [...groups]
    .filter(([, byIndex]) => byIndex.size === 9 && [...byIndex.values()].every(items => items.length === 1))
    .sort(([a], [b]) => directoryRank(a) - directoryRank(b) || naturalCompare(a, b));
  if (complete.length) {
    const bestRank = directoryRank(complete[0][0]);
    const preferred = complete.filter(([dir]) => directoryRank(dir) === bestRank);
    if (preferred.length > 1) {
      throw new Error('Plusieurs séries de 9 vues sont présentes au même niveau ; le ZIP est ambigu.');
    }
    const byIndex = complete[0][1];
    return Array.from({ length: 9 }, (_, i) => byIndex.get(i + 1)[0]);
  }

  const duplicates = [...groups.values()].some(byIndex => [...byIndex.values()].some(items => items.length > 1));
  if (duplicates) throw new Error('Vues numérotées en double ; impossible de choisir une série de production fiable.');
  const candidates = entries.filter(entry => !DECOY.test(pathOf(entry)));
  if (candidates.length === 9) return candidates.sort((a, b) => naturalCompare(pathOf(a), pathOf(b)));
  throw new Error('Impossible d’identifier une série unique de 9 vues de production.');
}

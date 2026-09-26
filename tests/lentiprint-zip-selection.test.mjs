import test from 'node:test';
import assert from 'node:assert/strict';
import { selectNineViewEntries } from '../modules/lentiprint-zip-selection.js';

const entries = names => names.map(name => ({ name, dir: false }));
const numbered = (prefix, ext = 'png') => Array.from({ length: 9 }, (_, i) => prefix + String(i + 1).padStart(2, '0') + '.' + ext);

test('selects numbered production views and ignores montage, mask, depth, and preview PNGs', () => {
  const input = entries([
    ...numbered('views/view_'),
    ...numbered('masks/groupe-'),
    'montage.jpg', 'depth-map.png', 'preview.png'
  ]);
  assert.deepEqual(selectNineViewEntries(input).map(x => x.name), numbered('views/view_'));
});

test('chooses root vue-01 through vue-09 over nine mask exports', () => {
  const input = entries([
    ...numbered('vue-'),
    ...numbered('masques/groupe-'),
    'source-carte.png', 'montage.png'
  ]);
  assert.deepEqual(selectNineViewEntries(input).map(x => x.name), numbered('vue-'));
});

test('accepts prefixed 1-to-9 and zero-padded vue names in sources/', () => {
  const input = entries([
    ...Array.from({ length: 9 }, (_, i) => 'sources/client-vue-' + (i + 1) + '.jpg'),
    ...numbered('vue-')
  ]);
  assert.deepEqual(selectNineViewEntries(input).map(x => x.name),
    Array.from({ length: 9 }, (_, i) => 'sources/client-vue-' + (i + 1) + '.jpg'));
});

test('uses manifest view_files order when paths include directories', () => {
  const files = entries(numbered('views/view_'));
  const manifest = { view_files: [...files].reverse().map(x => x.name) };
  assert.deepEqual(selectNineViewEntries(files, manifest).map(x => x.name), [...files].reverse().map(x => x.name));
});

test('accepts Gaussian manifest views by basename while ignoring the root montage', () => {
  const files = entries([...numbered('views/view_'), 'montage.jpg']);
  const manifest = { views: numbered('view_').map(file => ({ file })) };
  assert.deepEqual(selectNineViewEntries(files, manifest).map(x => x.name), numbered('views/view_'));
});

test('rejects ambiguous duplicate numbered views instead of choosing an arbitrary image', () => {
  const input = entries([
    ...numbered('sources/vue-'),
    ...numbered('sources/copy-vue-')
  ]);
  assert.throws(() => selectNineViewEntries(input), /ambigu|unique|double|exactement/i);
});

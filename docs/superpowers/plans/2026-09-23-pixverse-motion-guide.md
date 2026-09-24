# PixVerse Motion Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing PixVerse pipeline with catalogue-selected movement guides, dedicated Mimic routing, safe framing, visual-progress nine-frame selection, stabilization, automatic QC, and 60 LPI export.

**Architecture:** Keep the current upload/create/status/video endpoints and action UI. Add a Mimic adapter and capability router, normalize the action catalogue to schema v11, prepare a safely framed source image, analyze every returned MP4 on one visual-progress path, then stabilize and grade the nine views before export. Existing Standard, Transition, Omni, Multi-transition, Modify, Photo V02.3, Card V33, and the 50 LPI depth path remain isolated.

**Tech Stack:** Browser ES modules, Vercel Node.js functions, Canvas 2D, IndexedDB, Node test runner, JSZip, FFmpeg for offline fixture audit only.

**Spec:** `docs/superpowers/specs/2026-09-23-pixverse-motion-guide-design.md`

## Global Constraints

- Work only on `feature/pixverse-v3-motion-guide`, based on `feature/pixverse-v2-controls` commit `29d309c5`.
- Never modify or merge directly into `main`.
- Do not modify Photo V02.3 or Card V33 program files.
- PixVerse movement output is nine views at 60 LPI; geometric depth remains 50 LPI.
- A movement guide must never auto-route to Omni/Fusion.
- Every selected sequence is a single continuous A→B action with no return.
- A red QC result blocks automatic production export.
- Paid PixVerse calls are manual smoke tests, never unit-test side effects.

## Review Focus

- A guide is present for a couple, group, object, or vehicle: automatic routing must not assume Mimic support; pinned in Task 2 routing tests.
- A two-second clip contains idle time and a late gesture: selection must use visual progress rather than uniform timestamps; pinned in Task 5 synthetic-series tests.
- A Fusion-like subject/background takeover happens late: scene replacement must yield RED; pinned in Task 6 fixture-metric tests.
- The browser reloads while PixVerse is processing: polling must resume without creating a new paid job; pinned in Task 3 IndexedDB tests.
- Face/hand landmarks are required but unavailable: QC must report the missing requirement and never fabricate GREEN; pinned in Task 6 aggregation tests.

---

### Task 1: Shared one-way policy and PixVerse Mimic API adapter

**Files:**
- Create: `modules/pixverse-motion-policy.js`
- Modify: `api/pixverse-create.js`
- Modify: `modules/pixverse-client.js`
- Create: `tests/pixverse-mimic-api.test.mjs`
- Create: `tests/pixverse-motion-policy.test.mjs`

**Interfaces:**
- Produces: `hardenMotionPrompts(prompt, negativePrompt, motionConfig)` returning `{prompt, negativePrompt, policy}`.
- Produces: `buildPixVerseRequest(mode, body)` returning `{endpoint, payload, mode}`.
- Existing API handler consumes `buildPixVerseRequest()` before calling PixVerse.

- [ ] **Step 1: Write failing prompt-policy tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { hardenMotionPrompts } from '../modules/pixverse-motion-policy.js';

test('finishes near the end without a long 65 percent hold', () => {
  const out = hardenMotionPrompts('Form a heart.', '', { finalStateTarget: 0.94 });
  assert.match(out.prompt, /final state between 90% and 98%/i);
  assert.doesNotMatch(out.prompt, /65%/);
  assert.match(out.negativePrompt, /reverse motion/);
});

test('policy is appended only once', () => {
  const once = hardenMotionPrompts('Wave.', '').prompt;
  const twice = hardenMotionPrompts(once, '').prompt;
  assert.equal(twice, once);
});
```

- [ ] **Step 2: Run prompt-policy tests and verify failure**

Run: `node --test tests/pixverse-motion-policy.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement the shared policy and replace duplicate client/API strings**

```js
export const MOTION_POLICY_MARKER = 'MICROPLAYER ONE-WAY MOTION V3';

export function hardenMotionPrompts(prompt = '', negativePrompt = '', motion = {}) {
  const target = Number(motion.finalStateTarget || 0.94);
  const policy = `${MOTION_POLICY_MARKER}: Perform one continuous A-to-B action. ` +
    `Reach the completed final state between 90% and 98% of useful motion ` +
    `(target ${Math.round(target * 100)}%), then keep only a brief clean final frame. ` +
    `Never reverse, repeat, bounce, loop, zoom, reframe or replace the subject.`;
  const source = String(prompt).trim();
  return {
    prompt: source.includes(MOTION_POLICY_MARKER) ? source : `${source} ${policy}`.trim(),
    negativePrompt: [negativePrompt, 'reverse motion, return, repeated action, identity change, subject replacement, camera movement'].filter(Boolean).join(', '),
    policy: 'microplayer-one-way-v3'
  };
}
```

- [ ] **Step 4: Write failing Mimic request tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPixVerseRequest } from '../api/pixverse-create.js';

test('builds the dedicated Mimic endpoint payload', () => {
  assert.deepEqual(buildPixVerseRequest('mimic', {
    img_id: 12, video_media_id: 34, quality: '720p'
  }), {
    mode: 'mimic',
    endpoint: '/video/mimic/generate',
    payload: { img_id: 12, video_media_id: 34, quality: '720p' }
  });
});

test('rejects a Mimic request without a guide', () => {
  assert.throws(() => buildPixVerseRequest('mimic', { img_id: 12, quality: '720p' }), /video_media_id/);
});
```

- [ ] **Step 5: Run Mimic request tests and verify failure**

Run: `node --test tests/pixverse-mimic-api.test.mjs`
Expected: FAIL because `buildPixVerseRequest` is not exported.

- [ ] **Step 6: Extract request building and add `mimic` to allowed modes**

```js
export function buildPixVerseRequest(mode, body) {
  if (mode === 'mimic') {
    const imgId = positiveInt(body.img_id);
    const mediaId = positiveInt(body.video_media_id);
    if (!imgId) throw new Error('img_id Mimic invalide.');
    if (!mediaId) throw new Error('video_media_id Mimic invalide.');
    return {
      mode,
      endpoint: '/video/mimic/generate',
      payload: { img_id: imgId, video_media_id: mediaId, quality: cleanQuality(body.quality) }
    };
  }
  return buildExistingPixVerseRequest(mode, body);
}
```

- [ ] **Step 7: Run focused and existing PixVerse tests**

Run: `node --test tests/pixverse-motion-policy.test.mjs tests/pixverse-mimic-api.test.mjs tests/video-frame-extractor-progressive.test.mjs`
Expected: 3 test files pass.

- [ ] **Step 8: Commit Task 1**

```bash
git add modules/pixverse-motion-policy.js modules/pixverse-client.js api/pixverse-create.js tests/pixverse-motion-policy.test.mjs tests/pixverse-mimic-api.test.mjs
git commit -m "feat: add PixVerse Mimic adapter"
```

---

### Task 2: Catalogue v11 schema and capability routing

**Files:**
- Create: `modules/action-schema.js`
- Modify: `modules/action-library.js`
- Modify: `data/actions-library.json`
- Create: `assets/action-guides/heart-hands-3s.mp4`
- Create: `tests/action-schema-v11.test.mjs`
- Create: `tests/pixverse-capability-routing.test.mjs`

**Interfaces:**
- Produces: `normalizeActionLibrary(raw)` returning schema version 11.
- Produces: `validateActionVariant(variant)` returning `{valid, errors}`.
- Produces: `resolvePixVerseMode({requestedMode, subjectType, guide, pixverse})` returning a mode string and reason.
- `loadActionLibrary()` consumes normalized schema before comparing/storing versions.

- [ ] **Step 1: Write schema migration and validation tests**

```js
test('normalizes a v10 person variant to v11 defaults', () => {
  const out = normalizeActionLibrary({ version: 10, actions: [{
    id: 'wave', label: 'Salut', variants: [{ id: 'p', family: 'person', prompt: 'Wave', duration: 2 }]
  }]});
  const v = out.actions[0].variants[0];
  assert.equal(out.version, 11);
  assert.deepEqual(v.microplayer, { strategy: 'progressive-nine-with-stabilization', lpi: 60, viewCount: 9 });
});

test('rejects Mimic without a guide and motion output at 50 LPI', () => {
  const result = validateActionVariant({
    id: 'bad', compatibleSubjects: ['person-single'], pixverse: { mode: 'mimic' },
    microplayer: { lpi: 50, viewCount: 9 }
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /guide/);
  assert.match(result.errors.join(' '), /60 LPI/);
});
```

- [ ] **Step 2: Run schema tests and verify failure**

Run: `node --test tests/action-schema-v11.test.mjs`
Expected: FAIL with missing module.

- [ ] **Step 3: Implement normalization and validation**

```js
export function normalizeActionLibrary(raw) {
  const copy = structuredClone(raw || {});
  copy.version = 11;
  copy.actions = (copy.actions || []).map(action => ({
    ...action,
    commercialName: action.commercialName || action.label || action.id,
    variants: (action.variants || []).map(variant => normalizeVariant(variant, copy.defaults || {}))
  }));
  return copy;
}
```

- [ ] **Step 4: Write capability-routing tests**

```js
test('routes one person with a guide to Mimic', () => {
  assert.equal(resolvePixVerseMode({ requestedMode: 'auto', subjectType: 'person-single', guide: { url: 'heart.mp4' }, pixverse: { mode: 'mimic' } }).mode, 'mimic');
});

for (const subjectType of ['couple', 'group', 'object', 'vehicle']) {
  test(`does not silently route ${subjectType} to Mimic`, () => {
    const result = resolvePixVerseMode({ requestedMode: 'auto', subjectType, guide: { url: 'guide.mp4' }, pixverse: { fallbackMode: 'standard' } });
    assert.equal(result.mode, 'standard');
  });
}
```

- [ ] **Step 5: Implement the router and catalogue heart action**

Add an active `heart_hands` action with the exact v11 fields from the design, a three-second guide URL, allowed `arms/hands/shoulders`, locked `face/head/background`, and 60 LPI output. Add `wave`, `blown_kiss`, and `held_object_move` as test catalogue entries with explicit subject compatibility and non-Mimic object fallback.

```js
export function resolvePixVerseMode({ requestedMode = 'auto', subjectType, guide, pixverse = {} }) {
  if (requestedMode !== 'auto') return { mode: requestedMode, reason: 'expert-override' };
  if (guide && ['person-single', 'dog', 'cat'].includes(subjectType) && pixverse.mode === 'mimic') {
    return { mode: 'mimic', reason: 'compatible-motion-guide' };
  }
  return { mode: pixverse.fallbackMode || 'standard', reason: 'capability-fallback' };
}
```

- [ ] **Step 6: Add the validated fluid heart guide asset and verify metadata**

Run: `ffprobe -v error -show_entries stream=width,height,r_frame_rate -show_entries format=duration -of json assets/action-guides/heart-hands-3s.mp4`
Expected: readable H.264 video, approximately 3 seconds, 30 fps.

- [ ] **Step 7: Run schema and routing tests**

Run: `node --test tests/action-schema-v11.test.mjs tests/pixverse-capability-routing.test.mjs`
Expected: all tests pass.

- [ ] **Step 8: Commit Task 2**

```bash
git add modules/action-schema.js modules/action-library.js data/actions-library.json assets/action-guides/heart-hands-3s.mp4 tests/action-schema-v11.test.mjs tests/pixverse-capability-routing.test.mjs
git commit -m "feat: add configurable motion-guide catalogue"
```

---

### Task 3: Client Mimic orchestration, upload cache, and resumable jobs

**Files:**
- Modify: `modules/pixverse-client.js`
- Create: `modules/pixverse-job-store.js`
- Create: `tests/pixverse-client-mimic.test.mjs`
- Create: `tests/pixverse-job-store.test.mjs`

**Interfaces:**
- Produces: `runPixVerseAction(file, variant, options)` with `mimic` support.
- Produces: `createPixVerseJobStore(storage)` with `save`, `loadActive`, `complete`, `getGuideMediaId`, and `putGuideMediaId`.
- Consumes: `resolvePixVerseMode()` and schema-v11 variant fields.

- [ ] **Step 1: Write failing Mimic orchestration tests with mocked upload/create functions**

```js
test('uploads photo and guide once then creates Mimic', async () => {
  const calls = [];
  const result = await orchestrateMimic({
    imageFile: { name: 'photo.jpg' }, guideFile: { name: 'heart.mp4' }, quality: '720p'
  }, {
    uploadImage: async () => ({ imgId: 11 }),
    uploadMedia: async () => ({ mediaId: 22 }),
    createVideo: async body => (calls.push(body), { videoId: 33 })
  });
  assert.equal(result.videoId, 33);
  assert.deepEqual(calls[0], { mode: 'mimic', imgId: 11, videoMediaId: 22, quality: '720p' });
});
```

- [ ] **Step 2: Run and verify orchestration failure**

Run: `node --test tests/pixverse-client-mimic.test.mjs`
Expected: FAIL because `orchestrateMimic` is missing.

- [ ] **Step 3: Implement Mimic orchestration and correct credit estimates**

Implement 9/10/12 credits per second for 360p/540p/720p Mimic estimates, label the result `estimatedCredits`, and retain all existing mode branches.

```js
export async function orchestrateMimic(input, deps) {
  const [{ imgId }, { mediaId }] = await Promise.all([
    deps.uploadImage(input.imageFile), deps.uploadMedia(input.guideFile)
  ]);
  return deps.createVideo({ mode: 'mimic', imgId, videoMediaId: mediaId, quality: input.quality });
}

const MIMIC_CREDITS_PER_SECOND = { '360p': 9, '540p': 10, '720p': 12 };
```

- [ ] **Step 4: Write failing resumable-job/cache tests**

```js
test('resumes one active video id without a new creation', async () => {
  const memory = new Map();
  const store = createPixVerseJobStore(memoryAdapter(memory));
  await store.save({ videoId: 77, actionId: 'heart_hands', status: 'processing', createdAt: 1 });
  assert.equal((await store.loadActive()).videoId, 77);
});

test('reuses a guide media id by sha256', async () => {
  const store = createPixVerseJobStore(memoryAdapter(new Map()));
  await store.putGuideMediaId('abc', 88);
  assert.equal(await store.getGuideMediaId('abc'), 88);
});
```

- [ ] **Step 5: Implement IndexedDB-backed store with injected test adapter**

```js
export function createPixVerseJobStore(adapter = indexedDbAdapter()) {
  return {
    save: job => adapter.set('active-job', structuredClone(job)),
    loadActive: () => adapter.get('active-job'),
    complete: result => adapter.set('active-job', { ...result, status: 'done' }),
    getGuideMediaId: hash => adapter.get(`guide:${hash}`),
    putGuideMediaId: (hash, mediaId) => adapter.set(`guide:${hash}`, Number(mediaId))
  };
}
```

- [ ] **Step 6: Run client and store tests**

Run: `node --test tests/pixverse-client-mimic.test.mjs tests/pixverse-job-store.test.mjs`
Expected: all tests pass.

- [ ] **Step 7: Commit Task 3**

```bash
git add modules/pixverse-client.js modules/pixverse-job-store.js tests/pixverse-client-mimic.test.mjs tests/pixverse-job-store.test.mjs
git commit -m "feat: orchestrate and resume Mimic jobs"
```

---

### Task 4: Safe framing before PixVerse upload

**Files:**
- Create: `modules/safe-framing.js`
- Modify: `modules/pixverse-client.js`
- Create: `tests/safe-framing.test.mjs`

**Interfaces:**
- Produces: `computeSafeFrameGeometry({width, height, safeMargin, anchor})`.
- Produces: `prepareSafeFramedImage(file, framing)` returning `{file, geometry, warnings}`.
- Mimic and Standard photo uploads consume the prepared file when framing is enabled.

- [ ] **Step 1: Write failing geometry tests**

```js
test('adds 14 percent safety without changing aspect ratio', () => {
  const g = computeSafeFrameGeometry({ width: 1000, height: 1500, safeMargin: 0.14, anchor: 'center' });
  assert.equal(g.outputWidth / g.outputHeight, 1000 / 1500);
  assert.ok(g.drawWidth < g.outputWidth);
  assert.ok(g.drawHeight < g.outputHeight);
  assert.equal(g.scale, 0.72);
});

test('rejects unsafe margin values', () => {
  assert.throws(() => computeSafeFrameGeometry({ width: 100, height: 100, safeMargin: 0.6 }), /safeMargin/);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test tests/safe-framing.test.mjs`
Expected: FAIL with missing module.

- [ ] **Step 3: Implement pure geometry and Canvas edge-extension rendering**

Use same-size output canvas, mirror the four source edges into the exposed border, apply a light blur to border-only pixels, then draw the undistorted source in the computed rectangle. Return original-to-working scale and offsets for later crop consistency.

```js
export function computeSafeFrameGeometry({ width, height, safeMargin = 0.14, anchor = 'center' }) {
  if (!(safeMargin >= 0 && safeMargin <= 0.3)) throw new Error('safeMargin doit être compris entre 0 et 0.3.');
  const scale = 1 - 2 * safeMargin;
  const drawWidth = Math.round(width * scale);
  const drawHeight = Math.round(height * scale);
  return { outputWidth: width, outputHeight: height, drawWidth, drawHeight,
    dx: Math.round((width - drawWidth) / 2), dy: Math.round((height - drawHeight) / 2), scale, anchor };
}
```

- [ ] **Step 4: Integrate preparation before photo upload and surface warnings**

Pass `variant.framing` into `prepareSafeFramedImage`; upload its returned file; include geometry in the job record and final manifest.

```js
const framed = await prepareSafeFramedImage(file, variant.framing || {});
const { imgId } = await uploadPixVerseImage(framed.file);
createArgs.imgId = imgId;
createArgs.safeFraming = framed.geometry;
onStatus?.({ step: 'safe-framing', warnings: framed.warnings });
```

- [ ] **Step 5: Run safe framing and client tests**

Run: `node --test tests/safe-framing.test.mjs tests/pixverse-client-mimic.test.mjs`
Expected: all tests pass.

- [ ] **Step 6: Commit Task 4**

```bash
git add modules/safe-framing.js modules/pixverse-client.js tests/safe-framing.test.mjs
git commit -m "feat: add action-aware safe framing"
```

---

### Task 5: Unified visual-progress analyzer and nine-state selector

**Files:**
- Create: `modules/motion-progress-analyzer.js`
- Modify: `modules/video-frame-extractor.js`
- Modify: `modules/video-frame-extractor-2s.js`
- Create: `tests/motion-progress-analyzer.test.mjs`
- Modify: `tests/video-frame-extractor-progressive.test.mjs`

**Interfaces:**
- Produces: `analyzeMotionProgress(samples, options)` returning `{usefulWindow, progression, discontinuities, reversalRatio}`.
- Produces: `selectNineProgressStates(analysis, options)` returning nine `{time, sampleIndex, progress, score, reasons}` items.
- Both extractor entry points consume this analyzer; no duration-based uniform path remains.

- [ ] **Step 1: Write failing idle/late-gesture and reversal tests**

```js
test('selects visual states instead of uniform time for a late gesture', () => {
  const samples = makeSeries([0,0,0,0,1,2,4,7,11,16,22,29,37,46,56,67,79,92]);
  const analysis = analyzeMotionProgress(samples, { count: 9 });
  const selected = selectNineProgressStates(analysis, { count: 9 });
  assert.equal(selected.length, 9);
  assert.ok(selected[1].time >= samples[4].time);
  assert.ok(selected.every((item, i) => i === 0 || item.progress >= selected[i - 1].progress));
});

test('flags a B-to-A return', () => {
  const analysis = analyzeMotionProgress(makeSeries([0,2,5,9,14,20,14,9,4]), { count: 9 });
  assert.ok(analysis.reversalRatio > 0.12);
});
```

- [ ] **Step 2: Run and verify analyzer failure**

Run: `node --test tests/motion-progress-analyzer.test.mjs`
Expected: FAIL with missing module.

- [ ] **Step 3: Implement monotonic progress, useful-window detection, and quantile selection**

Build cumulative positive progress after smoothing, trim low-energy leading/trailing samples, penalize adjacent discontinuities, and select nearest valid samples at progress quantiles `[0,.125,.25,.375,.5,.625,.75,.875,1]` while enforcing increasing time.

```js
const QUANTILES = [0, .125, .25, .375, .5, .625, .75, .875, 1];
const cumulative = [0];
for (let i = 1; i < smoothed.length; i++) cumulative.push(cumulative.at(-1) + Math.max(0, smoothed[i] - smoothed[i - 1]));
const total = Math.max(Number.EPSILON, cumulative.at(-1));
const progression = cumulative.map(value => value / total);
```

- [ ] **Step 4: Remove `extractShortClip()` uniform bypass**

Make `video-frame-extractor-2s.js` a compatibility wrapper that always delegates to the action-aware extractor with `count: 9` and preserves public exports.

```js
import { extractVideoFrames as baseExtractVideoFrames } from './video-frame-extractor.js';
export const extractVideoFrames = (video, options = {}) => baseExtractVideoFrames(video, { ...options, count: 9 });
```

- [ ] **Step 5: Extend extractor tests for two-second clips and exact A→B ordering**

Assert that short clips receive `extractionWindow.mode === 'visual-progress-v3'`, contain nine distinct increasing times, and contain no selected time after a detected return point.

- [ ] **Step 6: Run analyzer and extractor tests**

Run: `node --test tests/motion-progress-analyzer.test.mjs tests/video-frame-extractor-progressive.test.mjs`
Expected: all tests pass.

- [ ] **Step 7: Commit Task 5**

```bash
git add modules/motion-progress-analyzer.js modules/video-frame-extractor.js modules/video-frame-extractor-2s.js tests/motion-progress-analyzer.test.mjs tests/video-frame-extractor-progressive.test.mjs
git commit -m "feat: select nine views by visual progress"
```

---

### Task 6: Deterministic stabilization and GREEN/ORANGE/RED QC

**Files:**
- Create: `modules/frame-stabilizer.js`
- Create: `modules/generation-qc.js`
- Create: `tests/frame-stabilizer.test.mjs`
- Create: `tests/generation-qc.test.mjs`
- Create: `tests/fixtures/pixverse-video-metrics.json`

**Interfaces:**
- Produces: `estimateTranslation(referenceGray, candidateGray, width, height, maxShift)`.
- Produces: `stabilizeFrame(frame, transform, lockedRegions)`.
- Produces: `gradeGeneration(metrics, thresholds, requirements)` returning `{grade, exportAllowed, reasons, corrections}`.
- UI and ZIP manifest consume the complete QC report.

- [ ] **Step 1: Write failing translation tests**

```js
test('recovers a small two-pixel camera shift', () => {
  const reference = checkerboard(24, 24);
  const shifted = translate(reference, 24, 24, 2, -1);
  assert.deepEqual(estimateTranslation(reference, shifted, 24, 24, 4), { dx: -2, dy: 1, confidence: 1 });
});
```

- [ ] **Step 2: Run and verify stabilizer failure**

Run: `node --test tests/frame-stabilizer.test.mjs`
Expected: FAIL with missing module.

- [ ] **Step 3: Implement bounded luminance correlation and Canvas correction**

Search integer offsets within the configured radius, compare background-weighted luminance error, return the inverse correction transform, and composite corrected frames on a fixed output canvas without changing dimensions.

```js
export function estimateTranslation(reference, candidate, width, height, maxShift = 6) {
  let best = { error: Infinity, dx: 0, dy: 0 };
  for (let dy = -maxShift; dy <= maxShift; dy++) for (let dx = -maxShift; dx <= maxShift; dx++) {
    const error = shiftedMeanAbsoluteError(reference, candidate, width, height, dx, dy);
    if (error < best.error) best = { error, dx: -dx, dy: -dy };
  }
  return { dx: best.dx, dy: best.dy, confidence: confidenceFromError(best.error) };
}
```

- [ ] **Step 4: Write failing QC aggregation tests**

```js
test('Fusion takeover is red', () => {
  const report = gradeGeneration({ sceneCut: 0.8473, reversalRatio: 0.01 }, defaults, []);
  assert.equal(report.grade, 'red');
  assert.match(report.reasons.join(' '), /scene/i);
});

test('recoverable camera drift is orange', () => {
  const report = gradeGeneration({ sceneCut: 0.02, cameraShift: 0.04, correctedCameraShift: 0.01 }, defaults, []);
  assert.equal(report.grade, 'orange');
  assert.equal(report.exportAllowed, true);
});

test('missing required hand landmarks cannot be green', () => {
  const report = gradeGeneration({ sceneCut: 0.02, availableMetrics: ['sceneCut'] }, defaults, ['handIntegrity']);
  assert.equal(report.grade, 'red');
  assert.match(report.reasons.join(' '), /handIntegrity/);
});
```

- [ ] **Step 5: Implement metric thresholds and readable reasons**

Hard-red conditions: scene cut, subject replacement signal, excessive reversal, unrecoverable crop, discontinuity, failed/missing required metric. Orange conditions: successfully corrected translation/background drift or marginal adjacent spacing. Green requires every required metric available and within limits.

```js
export function gradeGeneration(metrics, thresholds, requirements = []) {
  const missing = requirements.filter(name => !metrics.availableMetrics?.includes(name));
  const red = missing.length || metrics.sceneCut > thresholds.maxSceneCut || metrics.reversalRatio > thresholds.maxReverseRatio || metrics.subjectReplacement;
  if (red) return { grade: 'red', exportAllowed: false, reasons: buildRedReasons(metrics, thresholds, missing), corrections: [] };
  const corrected = metrics.cameraShift > thresholds.maxCameraShift && metrics.correctedCameraShift <= thresholds.maxCameraShift;
  if (corrected) return { grade: 'orange', exportAllowed: true, reasons: ['Dérive caméra corrigée.'], corrections: ['translation'] };
  return { grade: 'green', exportAllowed: true, reasons: [], corrections: [] };
}
```

- [ ] **Step 6: Record audited fixture metrics**

Store guide maximum scene score `0.011581`, Mimic `0.016446`, and Fusion `0.847326` at 2.4 seconds in `tests/fixtures/pixverse-video-metrics.json`; assert Fusion RED and Mimic not RED for scene continuity.

```json
{
  "guide": { "maxSceneCut": 0.011581 },
  "mimic": { "maxSceneCut": 0.016446 },
  "fusion": { "maxSceneCut": 0.847326, "atSeconds": 2.4 }
}
```

- [ ] **Step 7: Run stabilization and QC tests**

Run: `node --test tests/frame-stabilizer.test.mjs tests/generation-qc.test.mjs`
Expected: all tests pass.

- [ ] **Step 8: Commit Task 6**

```bash
git add modules/frame-stabilizer.js modules/generation-qc.js tests/frame-stabilizer.test.mjs tests/generation-qc.test.mjs tests/fixtures/pixverse-video-metrics.json
git commit -m "feat: stabilize and grade PixVerse generations"
```

---

### Task 7: Integrate guide selection, progress, QC, and expert review into the existing UI

**Files:**
- Modify: `happyholo-pixverse-actions-test.html`
- Modify: `modules/pixverse-actions-ui.js`
- Modify: `pixverse-v2-controls-test.html`
- Create: `tests/pixverse-actions-ui-contract.test.mjs`

**Interfaces:**
- UI consumes normalized variant, `runPixVerseAction`, extractor analysis, stabilization result, and QC report.
- Produces DOM state IDs: `guidePreview`, `pixverseMode`, `pipelineProgress`, `qcSummary`, `candidateFrames`, `selectedFrames`, `expertPanel`.

- [ ] **Step 1: Write failing UI contract tests**

```js
test('actions page exposes guide, recommended mode, progress and expert QC surfaces', async () => {
  const html = await readFile(new URL('../happyholo-pixverse-actions-test.html', import.meta.url), 'utf8');
  for (const id of ['guidePreview','pixverseMode','pipelineProgress','qcSummary','candidateFrames','selectedFrames','expertPanel']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
});

test('V2 controls exposes Mimic without removing existing modes', async () => {
  const html = await readFile(new URL('../pixverse-v2-controls-test.html', import.meta.url), 'utf8');
  for (const mode of ['standard','transition','mimic','omni','multi_transition']) assert.match(html, new RegExp(`value=["']${mode}["']`));
});
```

- [ ] **Step 2: Run and verify UI contract failure**

Run: `node --test tests/pixverse-actions-ui-contract.test.mjs`
Expected: FAIL for missing IDs and Mimic option.

- [ ] **Step 3: Add the minimal production controls to the existing page**

Add photo, action, auto-associated guide preview, optional expert replacement, recommended automatic mode, generate button, four-stage progress display, QC summary, and nine selected thumbnails. Keep catalogue import/export and existing action filters.

```html
<video id="guidePreview" controls muted playsinline></video>
<output id="pixverseMode">Automatique recommandé</output>
<ol id="pipelineProgress"><li>PixVerse</li><li>Vidéo reçue</li><li>Analyse MicroPlayer</li><li>QC et 9 vues</li></ol>
<section id="qcSummary" aria-live="polite"></section>
<details id="expertPanel"><summary>Mode expert</summary><div id="candidateFrames"></div></details>
<div id="selectedFrames"></div>
```

- [ ] **Step 4: Add expert candidate review without changing automatic selection**

Render candidate timestamp, progress, discontinuity score, acceptance reason, and selected/rejected state. Expert replacement changes only the active guide file; it does not write into the bundled catalogue.

```js
function renderCandidate(item) {
  return `<figure data-selected="${item.selected}"><img src="${item.dataUrl}" alt="Image candidate"><figcaption>${item.time.toFixed(2)} s · ${(item.progress * 100).toFixed(0)}% · ${item.reasons.join(', ')}</figcaption></figure>`;
}
```

- [ ] **Step 5: Wire resumable jobs and prevent duplicate clicks**

On load, resume an active `videoId`; while status is processing, disable generation; on completion, persist the final URL and continue analysis. On PixVerse error, preserve the diagnostic and re-enable generation without auto-retrying credits.

```js
const active = await jobStore.loadActive();
if (active?.status === 'processing') await resumePixVerseJob(active);
generateButton.onclick = async () => {
  if (generateButton.disabled) return;
  generateButton.disabled = true;
  try { await generateAndAnalyze(); } finally { generateButton.disabled = false; }
};
```

- [ ] **Step 6: Add explicit Mimic to V2 controls and retain all V2 modes**

The mode label describes Mimic as movement transfer and Omni as composition/reference mode. Automatic selection displays its reason.

```html
<option value="mimic">Mimic — transfert de mouvement</option>
<option value="omni">Omni/Fusion — composition de références</option>
```

- [ ] **Step 7: Run UI and module tests**

Run: `node --test tests/pixverse-actions-ui-contract.test.mjs tests/pixverse-client-mimic.test.mjs tests/action-schema-v11.test.mjs`
Expected: all tests pass.

- [ ] **Step 8: Commit Task 7**

```bash
git add happyholo-pixverse-actions-test.html modules/pixverse-actions-ui.js pixverse-v2-controls-test.html tests/pixverse-actions-ui-contract.test.mjs
git commit -m "feat: add motion-guide and QC interface"
```

---

### Task 8: Production manifest and 60 LPI export gate

**Files:**
- Modify: `modules/pixverse-zip-bridge.js`
- Modify: `happyholo-pixverse-actions-test.html`
- Create: `tests/pixverse-motion-export.test.mjs`

**Interfaces:**
- Produces: `buildMotionManifest({action, job, selection, stabilization, qc})`.
- ZIP creation refuses automatic production export when `qc.grade === 'red'`.

- [ ] **Step 1: Write failing manifest/export tests**

```js
test('motion manifest is nine views at 60 LPI', () => {
  const manifest = buildMotionManifest({
    action: { id: 'heart_hands' }, selection: { frames: Array.from({ length: 9 }, (_, i) => ({ time: i / 4 })) },
    job: { modeUsed: 'mimic' }, qc: { grade: 'green' }, stabilization: { transforms: [] }
  });
  assert.equal(manifest.lpi, 60);
  assert.equal(manifest.effectType, 'motion');
  assert.equal(manifest.views.length, 9);
  assert.notEqual(manifest.pipeline, 'depth-50-lpi');
});

test('red QC blocks production ZIP', () => {
  assert.throws(() => assertMotionExportable({ grade: 'red' }), /QC rouge/);
});
```

- [ ] **Step 2: Run and verify export failure**

Run: `node --test tests/pixverse-motion-export.test.mjs`
Expected: FAIL because manifest helpers are missing.

- [ ] **Step 3: Implement manifest and QC gate**

Include schema version, action ID, guide URL/hash, mode, video ID, timestamps, candidate reasons, transforms, metric values, QC reasons, `effectType: 'motion'`, `lpi: 60`, and nine numbered PNG entries.

```js
export function buildMotionManifest({ action, job, selection, stabilization, qc }) {
  if (selection.frames.length !== 9) throw new Error('Le manifeste Motion exige exactement 9 vues.');
  return { schemaVersion: 3, effectType: 'motion', pipeline: 'pixverse-microplayer', lpi: 60,
    actionId: action.id, pixverse: { mode: job.modeUsed, videoId: job.videoId },
    views: selection.frames.map((frame, i) => ({ index: i + 1, file: `view-${String(i + 1).padStart(2, '0')}.png`, time: frame.time })),
    stabilization, qc };
}
```

- [ ] **Step 4: Preserve diagnostic export for RED results**

Allow download of a JSON diagnostic and candidate contact sheet when red, but disable the production ZIP button. Orange corrected output includes both pre-correction and post-correction metrics.

```js
export function assertMotionExportable(qc) {
  if (qc?.grade === 'red') throw new Error('QC rouge : export de production bloqué.');
}
```

- [ ] **Step 5: Run export and existing extractor tests**

Run: `node --test tests/pixverse-motion-export.test.mjs tests/video-frame-extractor-progressive.test.mjs`
Expected: all tests pass.

- [ ] **Step 6: Commit Task 8**

```bash
git add modules/pixverse-zip-bridge.js happyholo-pixverse-actions-test.html tests/pixverse-motion-export.test.mjs
git commit -m "feat: gate 60 LPI motion exports by QC"
```

---

### Task 9: End-to-end regression, recorded comparison, preview deployment

**Files:**
- Create: `scripts/audit-pixverse-fixtures.sh`
- Create: `docs/pixverse-motion-guide-validation.md`
- Modify: `README.md`

**Interfaces:**
- Script consumes local guide/Mimic/Fusion MP4 paths and prints duration, resolution, frame rate, and maximum FFmpeg scene score.
- Validation document records A/B/C results, limitations, and exact tested commit.

- [ ] **Step 1: Add a deterministic FFmpeg audit script**

```bash
#!/usr/bin/env bash
set -euo pipefail
for video in "$@"; do
  ffprobe -v error -show_entries stream=width,height,r_frame_rate -show_entries format=duration -of json "$video"
  ffmpeg -hide_banner -loglevel error -i "$video" -vf "select='gt(scene,0)',metadata=print:file=-" -an -f null - 2>/dev/null |
    awk '/^frame:/{for(i=1;i<=NF;i++) if($i ~ /^pts_time:/){split($i,a,":"); t=a[2]}} /lavfi.scene_score=/{split($0,a,"="); print t, a[2]}' |
    sort -k2,2nr | head -n 1
done
```

- [ ] **Step 2: Run the complete PixVerse-focused suite**

Run: `node --test tests/pixverse-*.test.mjs tests/action-schema-v11.test.mjs tests/safe-framing.test.mjs tests/motion-progress-analyzer.test.mjs tests/frame-stabilizer.test.mjs tests/generation-qc.test.mjs tests/video-frame-extractor-progressive.test.mjs`
Expected: all focused tests pass.

- [ ] **Step 3: Run the full repository suite and compare only against baseline**

Run: `npm test`
Expected: no new failures beyond the five documented pre-existing Card V32/V33 failures. Any additional failure blocks delivery.

- [ ] **Step 4: Run recorded A/B/C validation**

Run the audit script on the heart guide, Mimic output, and Fusion output. Feed Mimic through MicroPlayer selection/QC, verify exactly nine increasing states, and record:

- A unguided baseline when available;
- B Mimic continuity and identity observations;
- C selected timestamps, QC grade, and correction metrics;
- Fusion negative-control RED result.

- [ ] **Step 5: Exercise catalogue cases without paid generation**

Verify heart, wave, blown kiss, and held-object presets load, display their compatibility, choose the expected mode, load/replace guide media, and produce a valid analysis input. Confirm held-object mode does not choose Mimic automatically.

```js
for (const id of ['heart_hands', 'wave', 'blown_kiss', 'held_object_move']) {
  const { variant } = getActionVariant(library, id, id === 'held_object_move' ? 'object' : 'person');
  assert.equal(validateActionVariant(variant).valid, true);
}
assert.notEqual(resolvePixVerseMode({ requestedMode: 'auto', subjectType: 'object', guide: {}, pixverse: { fallbackMode: 'standard' } }).mode, 'mimic');
```

- [ ] **Step 6: Perform one controlled paid Mimic smoke test after diagnostic check**

Check `/api/pixverse-diag`, estimate and display credits, create one heart-with-hands Mimic job, resume it through status polling, analyze the returned MP4, and export only if QC is not red. Record the video ID and estimated credits in the validation document; do not repeat automatically after a failure.

- [ ] **Step 7: Update README and validation report**

Document the current 3-second guide workflow, Mimic routing limits, action-schema v11, 60/50 LPI separation, QC meanings, expert inspection, and the five pre-existing unrelated test failures.

```markdown
## PixVerse Motion Guide V3

Photo + action guide → Mimic when compatible → MP4 → visual-progress analysis → stabilization/QC → 9 PNG at 60 LPI.
Objects, vehicles, couples and groups do not silently use Mimic. RED blocks production export; ORANGE records corrections; GREEN is directly exploitable.
```

- [ ] **Step 8: Commit validation artifacts**

```bash
git add scripts/audit-pixverse-fixtures.sh docs/pixverse-motion-guide-validation.md README.md
git commit -m "docs: validate PixVerse motion guide pipeline"
```

- [ ] **Step 9: Verify branch and publish it without touching main**

Run:

```bash
git status --short
git log --oneline --decorate -12
git diff --check origin/feature/pixverse-v2-controls...HEAD
git push -u origin feature/pixverse-v3-motion-guide
```

Expected: clean worktree, no whitespace errors, only intended PixVerse/catalog/UI/docs/test files changed, remote branch created, no `main` update.

- [ ] **Step 10: Verify the branch preview on iPad-sized viewport**

Open `happyholo-pixverse-actions-test.html` and `pixverse-v2-controls-test.html` from the branch preview. Verify photo upload, action selection, guide preview, mode reason, progress stages, expert panel, nine selected frames, QC state, ZIP gate, and no horizontal overflow at 1024×1366.

---

## Self-review record

- **Spec coverage:** API, guide catalogue, compatibility routing, safe framing, asynchronous resume, progress-based selection, stabilization, QC, interface, 60 LPI export, four requested action classes, A/B/C comparison, and branch delivery are assigned to Tasks 1–9.
- **Protected versions:** no Photo V02.3, Card V33, or 50 LPI program file appears in any task.
- **Type consistency:** catalogue fields and the `mimic`, `guide`, `motion`, `framing`, `microplayer`, and `qc` names match the design document throughout.
- **No silent capability claim:** object/group routing and unavailable anatomical metrics have explicit tests.
- **No paid test automation:** the sole paid smoke test is a manual, single-job acceptance step after diagnostics and credit display.

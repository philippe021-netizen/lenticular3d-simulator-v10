# PixVerse Motion Guide — Design

**Date:** 2026-09-23
**Branch:** `feature/pixverse-v3-motion-guide`
**Base:** `feature/pixverse-v2-controls` at `29d309c5`

## Purpose

Extend the working MicroPlayer PixVerse integration so an action preset can pair a customer photo with a movement guide. PixVerse supplies motion; MicroPlayer remains responsible for safe framing, extracting a strictly one-way A→B sequence, stabilizing the nine views, quality control, and 60 LPI delivery.

This is an extension of the current upload/create/status/video/extraction/export pipeline. It is not a replacement pipeline.

## Protected boundaries

- Never modify or merge directly into `main`.
- Do not change Photo V02.3 or Card V33 program files.
- Do not route PixVerse motion output through the 50 LPI geometric-depth pipeline.
- Keep existing Standard, Transition, Omni/Fusion, Multi-transition, Modify, upload, status, and video-proxy capabilities working.
- Fusion/Omni must not be selected automatically for a movement guide.
- The nine views always represent one continuous A→B progression. No B→A return is included.

## Capability routing

`auto` mode is capability-driven:

| Input/action | Default route | Reason |
|---|---|---|
| One person + guide | PixVerse Mimic | Dedicated motion transfer |
| One dog/cat + compatible guide | PixVerse Mimic | Supported target class, QC remains strict |
| Couple/group | Existing Standard/Transition unless preset explicitly opts into experimental Mimic | Mimic cannot be assumed to preserve several identities |
| Object/vehicle | Existing Standard/Transition or local MicroPlayer strategy | Mimic is not an object-motion API |
| Explicit expert mode | Requested existing mode | Preserve V2 controls without changing automatic defaults |

Mimic request payload:

```js
{
  mode: 'mimic',
  img_id: 123,
  video_media_id: 456,
  quality: '720p'
}
```

The API adapter sends this to `/openapi/v2/video/mimic/generate`. The existing status endpoint and MP4 proxy remain the return path.

## Action catalogue schema

The bundled library moves to schema version 11. Existing version 10 libraries are normalized at load time. An action variant may define:

```json
{
  "id": "person-heart-hands",
  "commercialName": "Cœur avec les mains",
  "category": "gesture",
  "compatibleSubjects": ["person-single"],
  "guide": {
    "url": "./assets/action-guides/heart-hands-3s.mp4",
    "durationSeconds": 3,
    "startFrame": 0,
    "endFrame": 89,
    "sha256": "catalogued-at-build-time"
  },
  "pixverse": {
    "mode": "mimic",
    "model": "mimic",
    "quality": "720p",
    "prompt": "...",
    "negativePrompt": "...",
    "parameters": {}
  },
  "motion": {
    "allowedZones": ["arms", "hands", "shoulders"],
    "lockedZones": ["face", "head", "background"],
    "finalStateTarget": 0.94,
    "minimumUsefulSpan": 0.68
  },
  "framing": {
    "rule": "keep-full-gesture",
    "safeMargin": 0.14,
    "fill": "edge-extend"
  },
  "microplayer": {
    "strategy": "progressive-nine-with-stabilization",
    "lpi": 60,
    "viewCount": 9
  },
  "qc": {
    "maxSceneCut": 0.18,
    "maxHeadDrift": 0.035,
    "maxBackgroundDrift": 0.06,
    "maxCameraShift": 0.025,
    "maxAdjacentJump": 0.22,
    "maxReverseRatio": 0.12
  }
}
```

Validation rejects unknown routing combinations, non-nine-view motion presets, non-60 LPI motion presets, missing guides for Mimic, and invalid thresholds. The UI only exposes compatible actions for the selected subject class.

## Prompt policy

The one-way policy is owned by a single shared module used by both browser and API tests. The final state must occur near the end, not at 65% followed by a long hold.

Default rules:

- begin from a natural start pose;
- progress continuously in one direction;
- reach the completed pose between 90% and 98% of useful motion;
- keep the completed pose only long enough to provide a clean final frame;
- never reverse, repeat, bounce, loop, zoom, reframe, or replace the subject;
- only the preset's allowed zones may move.

## Safe framing

Before PixVerse upload, MicroPlayer creates a same-aspect-ratio working image with configurable safety margin. The original image is scaled down without distortion and centered according to the preset. Missing border pixels are filled by mirrored edge extension with a soft blur, never by generative replacement.

The prepared image retains metadata describing the scale and offset so the final nine views can be cropped consistently. A warning is emitted when the source does not contain enough visible anatomy for the requested action; safe framing cannot invent already-cropped hands or arms.

## MP4 analysis and nine-view selection

All durations use the same analyzer. The direct uniform extraction path for clips of 2.35 seconds or less is removed.

Analysis operates on low-resolution luminance and edge signatures sampled across the clip:

1. Estimate useful motion energy and exclude initial/final idle spans.
2. Compute distance from the accepted start state and adjacent-frame discontinuity.
3. Detect scene cuts, camera jumps, background drift, and movement reversal.
4. Build a monotonic visual-progress curve from the useful motion interval.
5. Select nine target progress quantiles from 0% through 100%, not nine equal timestamps.
6. Reject candidate frames near discontinuities or with excessive local anomaly score.
7. Enforce temporal order and a minimum adjacent visual difference.

The analyzer exposes candidate metrics and selection reasons for expert mode.

## Stabilization

MicroPlayer first estimates translation/scale drift against the source plate. Recoverable drift is corrected before export. Locked zones use the source plate as the visual reference; the first implementation provides deterministic global alignment and background-edge consistency without inventing pixels.

Automatic face, pose, and hand landmark providers are optional adapters. If a required landmark provider is unavailable, the system reports the metric as unavailable and cannot award a green result for an action whose preset requires it. It must not manufacture a passing score.

## QC contract

The QC report contains individual metrics, reasons, and a final disposition:

- **GREEN:** all required hard metrics available and inside thresholds; direct export allowed.
- **ORANGE:** only recoverable framing/alignment/background errors; corrected output may be exported after re-check.
- **RED:** scene change, identity/subject replacement, reverse motion, unrecoverable crop, major discontinuity, or required anatomical QC unavailable/failed.

Metrics include scene continuity, temporal continuity, motion monotonicity, adjacent differences, camera/background stability, head/face drift when available, region appearance drift, clothing/object consistency, and anomaly flags. Fusion takeover fixtures must score RED. The known Mimic heart fixture must not score RED for a scene cut.

## Job and credit protection

- Disable duplicate generation while a job is active.
- Persist `videoId`, action ID, selected mode, timestamps, and status in IndexedDB.
- Resume status polling after reload without creating a second PixVerse job.
- Cache guide uploads by guide SHA-256 for the browser session.
- Record estimated credits, while labelling them as estimates rather than account balance.

## Interface

The existing PixVerse Actions page gains:

- customer photo loader;
- compatible action selector;
- automatically associated guide preview;
- optional expert guide replacement;
- recommended automatic PixVerse mode;
- generation progress stages;
- QC disposition and reasons;
- candidate frame strip and selected nine-view strip in expert mode.

The V2 controls page remains a technical test surface and gains explicit Mimic selection without removing its existing modes.

## Export

The result remains nine PNG views plus ZIP manifest. The manifest adds action/schema version, PixVerse mode, guide identity, selected timestamps, QC report, stabilization data, and `lpi: 60`. A diagnostic MP4 link remains available. GIF/MP4 preview export may be added only after the nine-view/QC path is verified; it is not allowed to block the production ZIP.

## Verification

Automated tests cover:

- Mimic request validation and endpoint routing;
- automatic capability routing;
- schema normalization/validation;
- one-way prompt policy near-end completion;
- safe framing geometry;
- monotonic nine-view selection for short and long clips;
- scene-cut and reversal rejection;
- GREEN/ORANGE/RED aggregation;
- job resume and guide-upload cache;
- preservation of existing PixVerse modes;
- 60 LPI motion manifest and separation from 50 LPI depth.

Recorded fixtures cover the three-stage comparison:

- A: unguided generation or recorded baseline;
- B: PixVerse Mimic result;
- C: MicroPlayer-selected/stabilized nine views.

The heart-with-hands case is the release gate. Wave, blown kiss, and a simple held-object action are catalogue/test cases; object actions do not silently use Mimic.

## Explicit non-goals for this branch

- No redesign of Photo V02.3 or Card V33.
- No server-side GPU worker or new database infrastructure.
- No claim that browser-only heuristics can certify finger anatomy as reliably as a trained hand model.
- No automatic paid PixVerse generation in unit tests.
- No merge to `main`.

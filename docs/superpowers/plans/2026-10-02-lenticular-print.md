# MicroPlayer Lenticular Print Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add a calibrated 9-view interlacing workflow that exports a print-ready 10 × 15 cm 50 LPI image while retaining existing view exports and simulator.

**Architecture:** Keep the interlacing math in a dependency-free module with deterministic raster tests. Add a touch-first print screen that accepts PNGs/ZIPs and can receive the current Photo & relief views through a same-origin popup handshake; do not alter existing generation, retouch, simulator, or ZIP formats.

**Tech Stack:** Browser ES modules, Canvas 2D, PNG pHYs metadata, Node built-in test runner, existing static/Vercel app.

**Spec:** User request in this conversation.

## Global Constraints

- Preserve `main`, backups, existing 9-view ZIP export, and simulator.
- Use 9 source views; make nominal LPI and calibrated LPI separate values.
- Default print preset: exact 100 × 150 mm target, portrait or landscape, 3:2 ratio, 50 nominal LPI, 600 DPI raster.
- Calibration values initially span 49.5–50.5 LPI in 0.1 LPI steps; this is a starting chart, not a physical calibration result.
- Never silently stretch, fit to page, or modify the source aspect ratio.
- Browser UX must support iPad Safari touch and Apple Pencil.

## Review Focus

- Invalid, missing, or out-of-order inputs: reject anything other than exactly nine readable views and sort ZIP entries numerically.
- Non-integer pixels per lens: choose the view at each output pixel center using calibrated pitch, without cumulative rounding.
- Crop and orientation changes: map all views through one explicit crop rectangle and test portrait/landscape and vertical/horizontal lens directions.
- Print metadata: write PNG physical-resolution metadata and export target dimensions/pitch in a manifest; state the printer must use 100% scale.
- Large iPad raster: render in bounded row strips and keep source views as image objects rather than allocating nine full output-sized buffers.

---

### Task 1: Deterministic interlace core

**Files:**
- Create: `modules/lenticular-print-core.js`
- Test: `tests/lenticular-print-core.test.mjs`

**Interfaces:**
- `createPrintSpec(options)` returns integer raster dimensions plus exact target millimeters, DPI, nominal/calibrated LPI, lens orientation, and phase.
- `interlacePixelRows(views, width, height, options)` combines nine equal RGBA rasters for unit tests and bounded strips.
- `calibrationPitchValues()` returns the configured 11 pitch candidates.
- `addPngPhysicalResolution(pngBytes, dpi)` inserts a valid `pHYs` chunk after PNG `IHDR`.

- [x] Write failing assertions for both 100 × 150 orientations, 9-view band assignment, reversed order, phase shift, 49.0/50.0/51.0 selection behavior, 11 calibration pitches, and PNG pHYs parsing.
- [x] Run `node --test tests/lenticular-print-core.test.mjs` and confirm feature-specific failures.
- [x] Implement the pure functions using pixel-center phase: `fract(((axisPixel + 0.5 + phasePx) / (dpi / calibratedLpi)))`; map its nine equal intervals to a view, with no rounded lens-period accumulator.
- [x] Run the focused test until green.

### Task 2: Bounded browser raster and print screen

**Files:**
- Create: `modules/lenticular-print-browser.js`
- Create: `microplayer-lenticular-print.html`
- Test: `tests/lenticular-print-browser.test.mjs` (pure crop, sort, and manifest helpers only)

**Interfaces:**
- Accept nine image files or the existing ZIP (`vue-01.png` … `vue-09.png`).
- Render using a reusable output canvas and a 32-row strip buffer; explicit normalized crop/pan/zoom applies equally to every view.
- Provide 10 × 15 cm, portrait/landscape, nominal LPI 50, calibrated LPI 49–51 (0.01 increments), 600 DPI, view order, lenticule orientation, and phase controls.
- Generate the interlaced PNG and manifest; PNG target dimensions are nearest integer pixel counts at 600 DPI, exact 100 × 150 mm target is recorded, and pHYs supplies 600 DPI metadata.
- Offer a crop preview and a pixel-level zoom view of the actual interlaced output, plus a calibration chart with 11 bands from 49.5 to 50.5 LPI.
- Display `100 % / taille réelle — désactiver « ajuster à la page »` next to each print export.

- [x] Write tests for ZIP filename order, bad/missing view rejection, shared crop transform, manifest fields, and calibration chart pitch values; observe failures.
- [x] Implement canvas output with explicit crop; do not resample the interlaced raster through CSS for export.
- [x] Add touch-sized controls and progress/error states suitable for Safari on iPad.
- [x] Run focused browser-helper tests and verify generated PNG dimensions, pHYs, and manifest by reopening the output.

### Task 3: Integrate without replacing validated flows

**Files:**
- Modify: `relief3d-test-v31.html`
- Modify: `relief-engine-v31.js`
- Modify: `index.html`
- Modify: `service-worker-v317.js`
- Test: existing `tests/video-frame-extractor-progressive.test.mjs` and all available tests.

**Interfaces:**
- Keep `Exporter 9 vues` and `Télécharger ZIP` unchanged.
- Add a separate `Impression lenticulaire` action after nine views are ready; open the new screen and send those nine `Blob`s via a same-origin readiness handshake.
- Add a hub route for opening the print screen directly, including ZIP upload for prior sessions.

- [x] Add an integration regression confirming the existing export controls remain present and the new route is registered.
- [x] Run existing and new tests.
- [x] Serve the app locally and exercise source view receipt, interlacing, calibration generation, PNG save/reopen dimensions, and manifest inspection; inspect the responsive print screen at iPad viewport size.
- [x] Commit the isolated feature branch after verification.

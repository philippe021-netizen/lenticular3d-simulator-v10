# MicroPlayer Business Card V32

Experimental branch. Do not merge into main until visual acceptance.

## Goal
Convert a photographed or digital business card into a clean lenticular 3D composition while preserving original typography, logos and pixels.

## Acceptance criteria
1. Rectify perspective before analysis.
2. Never regenerate text or logos with generative AI.
3. Explicit semantic groups: name, role, logo, phone, email, web, address, social, slogan, decorative graphic, background.
4. Associate icons with their text when appropriate.
5. Each group has a mask and editable depth 0..255.
6. Pencil correction edits masks only, never source artwork.
7. Controlled depth planes; no brightness-derived depth inside letters/logos.
8. Render all 9 views from one immutable source plus masks/depth.
9. Preview continuous parallax/occlusion, not slideshow or whole-image translation.
10. Export source, group manifest, masks, depth map and 9 views for QC.

## Pipeline
INPUT -> four-corner placement -> perspective rectification/crop -> conservative normalization -> local OCR with word/line coordinates -> semantic role assignment -> icon/logo/artwork detection -> deterministic grouping -> mask refinement -> editable depth stack -> depth-map composition -> 9-view rendering -> interpolated lenticular preview -> export/QC.

## Modules
CardNormalizer: canonical full-card image + transform matrix; never invent artwork.

TextRecognizer: browser-side Tesseract worker on iPad. Its exact text and coordinates are authoritative and may not be rewritten by the visual model.

SemanticAnalyzer: provider-independent objects with id, type, label, bbox, mask/polygon, confidence and relations. It classifies OCR lines and detects non-textual elements only.

GroupResolver: associates related elements, e.g. phone icon + number, while preserving component masks.

MaskEditor: Apple Pencil-first, low latency, add/subtract, undo/redo, zoom/pan; masks only.

DepthComposer: controlled 8-bit map. Card plane neutral; semantic presets remain editable.

MultiViewRenderer: one immutable source and one depth representation for every view. View 5 is reference.

LenticularPreview: continuous scrub/autoplay; amplitude and convergence are separate controls.

## QC
Perspective rectangular; typography/logo unchanged; no mask leakage; coherent group depth; view 5 stable; no unintended global background drift; clear foreground/background separation without halos or cuts.

## Reject
Brightness-based depth for cards; AI-redrawn typography; 9 independent AI generations; connected-components treated as semantics; horizontal preview motion accepted as proof of 3D.

## Current implementation
`microplayer-card-v32-scanner.html` performs perspective correction, local OCR and semantic grouping. It transfers the immutable rectified source, OCR lines and groups to `microplayer-card-v32-studio.html`.

The studio creates pixel masks, supports low-latency Pencil add/erase with undo, keeps an editable depth per group, optionally limits DepthFlow to background/internal artwork relief, renders nine views from one source, verifies view 05 pixel-for-pixel, interpolates the preview continuously and exports source, OCR manifest, group manifest, masks, depth map and the nine PNG views.

## Next validation gate
Run a varied real-card corpus. Reject any card where OCR characters, group count, icon association, mask leakage or view-05 integrity fail. PP-DocLayoutV3 remains the server-side candidate for a later layout/segmentation backend; it must plug into the provider-independent element schema rather than replace the authoritative OCR text.

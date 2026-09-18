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
INPUT -> boundary detection -> perspective rectification/crop -> conservative normalization -> layout/text/icon/logo detection -> semantic grouping -> mask refinement -> editable depth stack -> depth-map composition -> 9-view rendering -> lenticular preview -> export/QC.

## Modules
CardNormalizer: canonical full-card image + transform matrix; never invent artwork.

SemanticAnalyzer: provider-independent objects with id, type, label, bbox, mask/polygon, confidence and relations.

GroupResolver: associates related elements, e.g. phone icon + number, while preserving component masks.

MaskEditor: Apple Pencil-first, low latency, add/subtract, undo/redo, zoom/pan; masks only.

DepthComposer: controlled 8-bit map. Card plane neutral; semantic presets remain editable.

MultiViewRenderer: one immutable source and one depth representation for every view. View 5 is reference.

LenticularPreview: continuous scrub/autoplay; amplitude and convergence are separate controls.

## QC
Perspective rectangular; typography/logo unchanged; no mask leakage; coherent group depth; view 5 stable; no unintended global background drift; clear foreground/background separation without halos or cuts.

## Reject
Brightness-based depth for cards; AI-redrawn typography; 9 independent AI generations; connected-components treated as semantics; horizontal preview motion accepted as proof of 3D.

## First milestone
Build a V32 diagnostic page that stops after semantic grouping and depth-map composition. Show original/rectified card, groups, masks, editable depth values and grayscale depth map side by side. Feed the 9-view renderer only after this passes varied real cards.

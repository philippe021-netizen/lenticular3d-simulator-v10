# MicroPlayer — ZipDepth isolated A/B test

Branch: `experiment/zipdepth`
Base: `feature/photo-v02-continuous-depth`

## Rule
Do not modify validated Photo V02/V02.3 behavior. ZipDepth is an optional experimental depth provider only.

## Pipeline
source photo -> ZipDepth inference -> raw relative depth -> robust percentile normalization -> MicroPlayer 0..255 (0 far, 255 near) -> existing Pencil correction -> existing convergence/parallax/render pipeline -> 3-view QC -> 9 views.

## A/B protocol
For the exact same source photo, retain:
A. current MicroPlayer automatic depth
B. ZipDepth automatic depth

Compare:
- hair/fur/veil/fingers/thin objects
- subject/background edge integrity
- halos/double edges
- number of Pencil corrections required
- stability of view 05
- disocclusion artifacts in views 01/09
- inference time and memory on target hardware

## Integration constraints
- Keep current `onnxruntime-web` path isolated from the validated provider.
- No fallback may silently replace the current depth engine.
- ZipDepth result must be explicitly labelled in UI.
- Preserve raw ZipDepth output for diagnostic export.
- Normalize only after inference; never quantize before normalization.
- Determine/invert near/far orientation from the actual model output before mapping to MicroPlayer.
- No production enablement until A/B QC passes.

## Acceptance gate
ZipDepth is retained only if it produces visibly cleaner final 9-view output and/or materially reduces Pencil correction without introducing worse temporal/view-to-view artifacts. Speed alone is not sufficient if edge quality falls.

## Next implementation step
Add a separate experimental provider selector and load the verified ZipDepth ONNX model/config without altering the current provider code.

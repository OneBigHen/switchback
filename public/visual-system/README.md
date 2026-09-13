# OpenGravel visual system

This directory holds static visual-system assets that are safe to consume independently of the planner and routing code.

## Compact mark

`brand/switchback-compact-mark.svg` is the retained legacy asset path for the text-free compact OpenGravel mark. It remains functional for old links while the current shell and app icon use the canonical OpenGravel identity. Keep the surrounding wordmark as live text when used in the product.

## Generated illustrations

Generated illustrations belong under `illustrations/` only when they add personality or explain a feature. Ordinary route, GPX, evidence, and rider-learning UI should use the data-driven components in `src/components/graphics/` instead of raster art.

Generated art must never be presented as evidence for a real road, route, map condition, place, closure, or surface classification. Do not bake important UI copy into an image.

## Asset rules

- Prefer inline SVG components for controls and measured data.
- Prefer SVG for marks and simple explanatory graphics.
- Prefer WebP/AVIF for larger editorial illustrations when binary assets are intentionally added.
- Keep navigation and safety controls independent of illustration loading.
- Provide accessible live text adjacent to meaningful static imagery.

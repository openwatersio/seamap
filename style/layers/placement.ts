import type { ExpressionSpecification } from "@maplibre/maplibre-gl-style-spec";

/**
 * Per-anchor label offsets in S-4 B-560.3 preference order: a point's name starts right of the
 * symbol, else ends left of it, else sits above, else below.
 *
 * Arguments are unsigned em distances from the symbol's centre to the nearest glyph edge; the
 * signs that map them onto MapLibre's screen axes (+x right, +y down) belong to the anchor. Most
 * chart symbols are taller than they are wide, so `above`/`below` are sized off the sprite's
 * half-height while `x` comes off its half-width. Marks whose art sits above the position they
 * mark (buoy bodies, topmarks) need `below` smaller than `above`.
 */
export function anchorOffsets(
  x: number,
  above: number = x,
  below: number = above,
): ExpressionSpecification {
  return ["literal", ["left", [x, 0], "right", [-x, 0], "bottom", [0, -above], "top", [0, below]]];
}

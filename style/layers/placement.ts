import type { ExpressionSpecification } from "@maplibre/maplibre-gl-style-spec";

/**
 * Per-anchor label offsets in S-4 B-560.3 preference order: a point's name starts right of the
 * symbol, else ends left of it, else sits above, else below.
 *
 * Arguments are unsigned em distances from the symbol's centre to the nearest glyph edge; the
 * signs that map them onto MapLibre's screen axes (+x right, +y down) belong to the anchor. Most
 * chart symbols are taller than they are wide, so `above`/`below` are sized off the sprite's
 * half-height while `x` comes off its half-width. Marks whose art sits above the position they
 * mark (buoy bodies, topmarks) need `below` smaller than `above`, and `lift` to raise a
 * side-anchored label from the charted point up to the body it stands beside.
 */
export function anchorOffsets(
  x: number,
  above: number = x,
  below: number = above,
  lift = 0,
): ExpressionSpecification {
  return [
    "literal",
    ["left", [x, -lift], "right", [-x, -lift], "bottom", [0, -above], "top", [0, below]],
  ];
}

/**
 * Label clearances for buoy/beacon marks in screen px, derived from the sprite sheet's
 * geometry: hull and stake bodies are 22px wide and up to 28px tall, standing 4px above the
 * sprite's bottom edge on the charted point; squat hulls (can, cone, sphere, barrel) stop
 * around 16px. placement.test.ts holds these numbers to sprites/dist/freenauticalchart.json.
 *
 * Every layer that labels a mark converts these to ems of its own text size via
 * {@link markOffsets}, so a lit and an unlit mark wear their labels at the same distance.
 */
export const MARK = {
  /** half a body's width plus clear water */
  side: 22 / 2 + 4,
  /** the tallest body's top plus room for a topmark */
  above: 28 - 4 + 8,
  /** the base pad below the point plus clear water */
  below: 4 + 8,
  /** a tall hull's centre above the point: art spans the 4px pad to 28px */
  lift: (28 + 4) / 2 - 4,
  /** a squat hull's centre, from the ~16px body heights */
  squatLift: 6,
};

/** {@link anchorOffsets} from {@link MARK}'s pixel clearances, in ems of `textSize`. */
export function markOffsets(textSize: number, lift = 0): ExpressionSpecification {
  return anchorOffsets(
    MARK.side / textSize,
    MARK.above / textSize,
    MARK.below / textSize,
    lift / textSize,
  );
}

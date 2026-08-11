import type { ExpressionSpecification } from "@maplibre/maplibre-gl-style-spec";

/**
 * What survives when symbols overlap, and how much of each surviving symbol gets drawn.
 *
 * The tiles carry two facts per point (`Seamap.java`): `family`, the budget it draws from, and
 * `cell_rank`, its position among its own family inside a 32-pixel cell at this zoom. Every
 * threshold over them lives here, so retuning what the chart shows costs a page reload rather
 * than a planet build.
 *
 * Budgets are per family, which is what keeps a harbour from being displaced by the forty buoys
 * around it: they never compete for the same allowance.
 */

/**
 * Symbols of one family per cell, below z9, from z9, from z11, and from z13. 999 is "all the tile
 * has". The lowest band is much tighter than a linear reading would suggest: a cell covers a huge
 * amount of ground at z7, and every family draws a real symbol there, so a handful fills the space.
 */
const BUDGET: Record<string, [number, number, number, number]> = {
  hazard: [2, 4, 8, 999],
  major_aid: [1, 3, 6, 999],
  minor_aid: [1, 2, 4, 999],
  // A harbour badge is wide and carries a name, so two in a cell rarely both place. Keeping one
  // lets rank pick it — the named marina — instead of leaving the choice to whatever the collision
  // grid reached first, which dropped Hellerup and kept an anonymous basin beside it.
  harbour: [1, 1, 3, 999],
  structure: [1, 2, 4, 999],
};

/**
 * A decoration draws when it is legible and it fits, and those are different questions.
 *
 * Legibility is a floor, and a real one: below the size where a topmark's cones separate it is a
 * smudge that says something false about the mark. Each decoration has its own, taken from where
 * the body's size ramp carries it past readable — not from a blanket declutter zoom, which would
 * withhold the topmarks of two cardinal buoys alone in an empty view for no reason at all.
 *
 * Fit is collision, which {@link decoration} does not express: the layers themselves opt in, and
 * bodies keep guaranteed placement so a decoration can drop while its mark stays.
 */
const LEGIBLE_FROM = {
  /** the cones of a cardinal separate around here, at ~0.7 of body size */
  topmark: 10,
  /** a caret above an already-small topmark */
  reflector: 11,
  /** the flare is a bold stroke and survives small */
  flare: 10,
  fogSignal: 11,
  /** sector geometry is wrong at every scale until rule 8 lands; hold it with the flare */
  sector: 10,
  /** text needs to be read, not merely seen */
  characteristic: 11,
  name: 12,
} as const;

/** The zoom can resolve this kind of decoration. */
export function decoration(kind: keyof typeof LEGIBLE_FROM): ExpressionSpecification {
  return [">=", ["zoom"], LEGIBLE_FROM[kind]];
}

/**
 * How small a symbol can be drawn and still mean something — a property of the artwork, not of the
 * feature's importance. Hue and gross silhouette survive scaling; internal detail does not, so what
 * a symbol has left at small size decides its floor.
 *
 * These are deliberately separate from prominence. A harbour disc shrinks brilliantly and is
 * mid-importance; a cardinal shrinks badly and is top-importance. One number setting both would
 * give each the wrong floor.
 */
export const TOKEN = {
  /** an enclosing circle with a knockout glyph: the circle is the whole message */
  disc: 0.25,
  /** buoy and beacon bodies, carried by colour and a squat silhouette */
  hull: 0.35,
  /** light stars: bold, simple, nothing inside to lose */
  star: 0.4,
  /** hazard glyphs — the asterisk, the cross — which are already near-minimal */
  mark: 0.45,
  /** lattice masts and landmark art, whose meaning is in their internal structure */
  detail: 0.55,
} as const;

/**
 * Floor from the token, full size at the zoom the feature's prominence earns. A body never
 * vanishes at the bottom of this ramp; only a budget removes one.
 */
export function sizeRamp(floor: number, fullAt: number, full = 1): ExpressionSpecification {
  return ["interpolate", ["linear"], ["zoom"], 6, floor, fullAt, full];
}

function budgetAt(step: 0 | 1 | 2 | 3): ExpressionSpecification {
  const arms = Object.entries(BUDGET).flatMap(([family, steps]) => [family, steps[step]]);
  return ["match", ["get", "family"], ...arms, 999] as unknown as ExpressionSpecification;
}

/** This feature is inside its family's allowance for the cell it sits in. */
export const withinBudget: ExpressionSpecification = [
  // `cell_rank` counts from zero, so the comparison is strict and BUDGET reads as symbol counts
  "<",
  // lines and areas hold no position in a cell, so they are never thinned
  ["coalesce", ["get", "cell_rank"], 0],
  ["step", ["zoom"], budgetAt(0), 9, budgetAt(1), 11, budgetAt(2), 13, budgetAt(3)],
];

/**
 * A name is a luxury: it is affordable where the symbols around it already fit, and it must never
 * take the room a light characteristic or a Racon group needs, because those change the decision
 * and a name does not.
 *
 * Being first in your own cell is the proxy for "there is room here". Where the chart is sparse
 * every mark is first and every mark is named; where it is crowded only the mark its neighbours
 * are ranked against gets one. That needs no data the tiles do not already carry.
 */
export const topOfCell: ExpressionSpecification = ["==", ["coalesce", ["get", "cell_rank"], 0], 0];

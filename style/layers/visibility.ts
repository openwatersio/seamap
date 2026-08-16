import type {
  DataDrivenPropertyValueSpecification,
  ExpressionFilterSpecification,
  ExpressionSpecification,
} from "@maplibre/maplibre-gl-style-spec";

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
 *
 * S-52 answers all of this from SCAMIN and a table of fixed symbol sizes, so standards mode makes
 * every helper here a pass-through and the layers read the same either way.
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
 * Fit is the budget the decoration shares with its body — never collision: a decoration anchored
 * a few pixels from its own body always intersects the mark it belongs to, so opting it into the
 * collision index draws none of them, anywhere.
 */
const LEGIBLE_FROM = {
  /** the cones of a cardinal separate around here, at ~0.7 of body size */
  topmark: 10,
  /** a caret above an already-small topmark */
  reflector: 11,
  /** the flare is a bold stroke and survives small */
  flare: 10,
  fogSignal: 11,
  /** below this the arc radius is a smudge around its own light */
  sector: 10,
  /** text needs to be read, not merely seen */
  characteristic: 11,
  name: 12,
} as const;

/**
 * The deepest safety depth the chart supports, mirroring `SeamarkPriority.MAX_SAFETY_DEPTH`: the
 * tiles retain hazards against thinning and give them early zoom floors only down to this depth,
 * so a deeper style setting would highlight from data that is not there. Keep the two in step.
 */
export const MAX_SAFETY_DEPTH = 30;

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
  disc: 0.1,
  /** buoy and beacon bodies, carried by colour and a squat silhouette */
  hull: 0.25,
  /** light stars: bold, simple, nothing inside to lose */
  star: 0.33,
  /** hazard glyphs — the asterisk, the cross — which are already near-minimal */
  mark: 0.33,
  /** lattice masts and landmark art, whose meaning is in their internal structure */
  detail: 0.4,
} as const;

/**
 * Bodies hold their token floor through the overview zooms and start growing here. Below this a
 * symbol is a locator — it says what and where, and the reader zooms for the rest — so it stays
 * at the smallest size that still means something rather than spending overview room on detail
 * nobody can use yet.
 */
export const RAMP_FROM = 9;

function budgetAt(step: 0 | 1 | 2 | 3): ExpressionSpecification {
  const arms = Object.entries(BUDGET).flatMap(([family, steps]) => [family, steps[step]]);
  return ["match", ["get", "family"], ...arms, 999] as unknown as ExpressionSpecification;
}

/** A zoom stop's size: a constant, or an expression over the feature. */
type Size = number | ExpressionSpecification;

/** The thinning, dressing and sizing rules the layer modules share. */
export interface Visibility {
  /** Strict S-52 portrayal rather than the chart's own. */
  standards: boolean;
  /** This feature is inside its family's allowance for the cell it sits in. */
  withinBudget: ExpressionFilterSpecification;
  /**
   * A name is a luxury: it is affordable where the symbols around it already fit, and it must
   * never take the room a light characteristic or a Racon group needs, because those change the
   * decision and a name does not.
   *
   * Being first in your own cell is the proxy for "there is room here". Where the chart is sparse
   * every mark is first and every mark is named; where it is crowded only the mark its neighbours
   * are ranked against gets one. That needs no data the tiles do not already carry.
   */
  topOfCell: ExpressionFilterSpecification;
  /** The zoom can resolve this kind of decoration. */
  decoration(kind: keyof typeof LEGIBLE_FROM): ExpressionFilterSpecification;
  /**
   * Floor from the token until {@link RAMP_FROM}, full size at the zoom the feature's prominence
   * earns. A body never vanishes at the bottom of this ramp; only a budget removes one.
   */
  sizeRamp(
    floor: number,
    fullAt: number,
    full?: number,
  ): DataDrivenPropertyValueSpecification<number>;
  /**
   * An icon or text size interpolated over `zoom, size` stops, for symbols whose growth follows
   * the detail they carry rather than the feature's prominence. The last stop is full size.
   */
  symbolSize(...stops: Size[]): DataDrivenPropertyValueSpecification<number>;
}

/**
 * The helper set for one portrayal. Standards mode neutralizes each one: SCAMIN carries no notion
 * of density, so nothing is thinned and nothing is undressed for want of room, and every symbol is
 * drawn at the fixed size the standard gives it.
 */
export function visibility(standards = false): Visibility {
  return {
    standards,
    withinBudget: standards || [
      // `cell_rank` counts from zero, so the comparison is strict and BUDGET reads as symbol counts
      "<",
      // lines and areas hold no position in a cell, so they are never thinned
      ["coalesce", ["get", "cell_rank"], 0],
      ["step", ["zoom"], budgetAt(0), 9, budgetAt(1), 11, budgetAt(2), 13, budgetAt(3)],
    ],
    topOfCell: standards || ["==", ["coalesce", ["get", "cell_rank"], 0], 0],
    decoration: (kind) => standards || [">=", ["zoom"], LEGIBLE_FROM[kind]],
    sizeRamp: (floor, fullAt, full = 1) =>
      standards ? full : ["interpolate", ["linear"], ["zoom"], RAMP_FROM, floor, fullAt, full],
    symbolSize: (...stops) =>
      standards ? stops[stops.length - 1] : ["interpolate", ["linear"], ["zoom"], ...stops],
  };
}

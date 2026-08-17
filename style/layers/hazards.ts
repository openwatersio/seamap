import type { ExpressionSpecification, LayerSpecification } from "@maplibre/maplibre-gl-style-spec";
import { colors } from "./palette.js";
import { TOKEN, sizeRamp, withinBudget } from "./visibility.js";

const HAZARD_TYPES = ["rock", "wreck", "obstruction"];

/**
 * Booms, oil and security barriers, log ponds, ice booms and shark nets are all charted the same
 * way: a dashed black line along the barrier with a legend naming it, never a hazard tint or a
 * point symbol (S-4 B-449.2, INT 1 F29.1; S-52 OBSTRN CATOBS 8/10 → LS(DASH,1,CSTLN)).
 */
const isFloatingBarrier: ExpressionSpecification = [
  "all",
  ["==", ["get", "type"], "obstruction"],
  ["in", ["get", "category"], ["literal", ["boom", "shark_net"]]],
];
const notFloatingBarrier: ExpressionSpecification = ["!", isFloatingBarrier];

/**
 * What the chart knows about a hazard's depth: the surveyed least depth when tagged, else the
 * seabed sampled at it. The two defaults encode opposite burdens of proof: a hazard is
 * only RUNG as an isolated danger when a known depth puts it at or above the safety depth
 * (9999 keeps unknowns out), but its area boundary only RELAXES to the safe style when a
 * known depth puts it below (-9999 keeps unknowns dangerous, per S-52's no-VALSOU rows).
 */
const notKnownDeep = (safety: number): ExpressionSpecification => [
  "<=",
  ["coalesce", ["get", "depth"], ["get", "seabed_depth"], -9999],
  safety,
];
const isKnownShallow = (safety: number): ExpressionSpecification => [
  "<=",
  ["coalesce", ["get", "depth"], ["get", "seabed_depth"], 9999],
  safety,
];

/**
 * The water around the hazard is itself navigable at the mariner's safety depth — the second
 * half of the UDWHAZ test, and the half that keeps the shore fringe quiet: a rock in water
 * already too shallow to enter contradicts nothing, so highlighting it says nothing. S-52 makes
 * the same call when no surrounding depth is known (no depth area found → no promotion), which
 * is what the -9999 default encodes. `surrounding_depth` is the shallowest water on a 250 m
 * ring around the hazard (`Seamark.java`).
 */
const navigableSurround = (safety: number): ExpressionSpecification => [
  ">=",
  ["coalesce", ["get", "surrounding_depth"], -9999],
  safety,
];

/**
 * Point hazards, hazard areas, and seabed text. These draw with the symbols, above the land
 * fills — a near-shore rock or wreck must never be hidden by an imprecise OSM coastline (S-52
 * draws points over coincident areas, §10.3.4.1).
 *
 * `safety` is the safety depth in metres, defaulting to seascape's 2 m small-craft default; it
 * drives the isolated-danger highlight and the hazard-area boundary style.
 */
export function hazards(safety = 2, unit: "m" | "ft" | "fm" = "m"): LayerSpecification[] {
  // the surveyed depth in the mariner's unit, floored toward shallower — the safe direction
  // (S-4 B-412); metres print as tagged, often with a decimal
  const depthText: ExpressionSpecification =
    unit === "m"
      ? ["to-string", ["get", "depth"]]
      : ["to-string", ["floor", ["*", ["get", "depth"], unit === "ft" ? 3.28084 : 0.546807]]];
  // A hazard shallower than the mariner's safety depth is never thinned. Rank is static and
  // cannot know that — it depends on a setting only the style holds — so the budget is the
  // ordinary path and this is the exemption (rule 1 of drafts/decide-what-to-show-when-symbols-overlap.md).
  const survivesThinning: ExpressionSpecification = ["any", withinBudget, isKnownShallow(safety)];
  return [
    {
      // RAPIDS: broken water a boat has to be lined up for, on the river reaches an inland chart
      // covers. Chart grey, as an area where the disturbed water was mapped as one and as a heavy
      // line where it was mapped along the channel (S-52 RAPIDS, AC(CHGRD) / LS(SOLD,3,CHGRD)).
      id: "rapids-fill",
      type: "fill",
      source: "seamap",
      "source-layer": "seamark",
      minzoom: 11,
      filter: ["all", ["==", ["get", "type"], "rapids"], ["==", ["geometry-type"], "Polygon"]],
      paint: { "fill-color": colors.chartGrey, "fill-opacity": 0.5 },
    },
    {
      id: "rapids-line",
      type: "line",
      source: "seamap",
      "source-layer": "seamark",
      minzoom: 11,
      filter: ["all", ["==", ["get", "type"], "rapids"], ["==", ["geometry-type"], "LineString"]],
      layout: { "line-cap": "round" },
      paint: {
        "line-color": colors.chartGrey,
        "line-width": ["interpolate", ["linear"], ["zoom"], 11, 1.5, 16, 3],
      },
    },
    {
      // a hazard with area extent tints like very shallow water (S-52 fills no-VALSOU hazard
      // areas with DEPVS) so a square kilometre of foul area stops looking like a single snag
      id: "hazard-areas-fill",
      type: "fill",
      source: "seamap",
      "source-layer": "seamark",
      minzoom: 8,
      filter: [
        "all",
        ["==", ["geometry-type"], "Polygon"],
        ["in", ["get", "type"], ["literal", HAZARD_TYPES]],
        notFloatingBarrier,
      ],
      paint: { "fill-color": colors.shallowWater, "fill-opacity": 0.2 },
    },
    {
      // the hazard-area limit: dotted for dangers at or above the safety depth (and unsurveyed
      // ones), dashed grey for those safely below it (S-52 OBSTRN07/WRECKS05 area portrayal)
      id: "hazard-areas",
      type: "line",
      source: "seamap",
      "source-layer": "seamark",
      minzoom: 8,
      filter: [
        "all",
        ["==", ["geometry-type"], "Polygon"],
        ["in", ["get", "type"], ["literal", HAZARD_TYPES]],
        notFloatingBarrier,
      ],
      paint: {
        "line-color": ["case", notKnownDeep(safety), colors.label, colors.chartGrey],
        "line-dasharray": [
          "case",
          notKnownDeep(safety),
          ["literal", [1, 1.5]],
          ["literal", [4, 2]],
        ],
        "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.6, 14, 1.4],
      },
    },
    {
      // A hazard at or above the mariner's safety depth, in water otherwise deep enough to
      // enter, wears a quiet magenta ring behind its own paper symbol — the UDWHAZ test in
      // both halves. Paper charts have no equivalent (they cannot know the safety depth); the
      // ECDIS answer is the loud ISODGR01 octagon, which replaces the symbol — this keeps the
      // paper symbology and whispers what ECDIS shouts.
      id: "isolated-dangers",
      type: "circle",
      source: "seamap",
      "source-layer": "seamark",
      // Point only: a circle layer marks every vertex of a polygon, and a shallow hazard
      // area already reads dangerous through its dotted boundary
      filter: [
        "all",
        ["==", ["geometry-type"], "Point"],
        ["in", ["get", "type"], ["literal", HAZARD_TYPES]],
        isKnownShallow(safety),
        navigableSurround(safety),
        // the shore fringe never promotes, whatever the ring margin says: near the coast the
        // DEM's land-water smoothing can put the surround a few decimetres either side of the
        // safety depth, and a rock there contradicts nothing the shore doesn't already say
        ["!", ["==", ["coalesce", ["get", "near_shore"], false], true]],
      ],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 6, 12, 10],
        "circle-opacity": 0,
        "circle-stroke-color": colors.magenta,
        "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 8, 1, 12, 1.4],
        "circle-stroke-opacity": 0.85,
      },
    },
    {
      id: "rocks_outline",
      type: "symbol",
      source: "seamap",
      "source-layer": "seamark",
      minzoom: 8,
      // a rock that never covers gets no danger circle and no tint (INT 1 K10); the danger
      // line is reserved ink (S-4 B-420.1)
      filter: [
        "all",
        ["==", ["get", "type"], "rock"],
        survivesThinning,
        [
          "!",
          [
            "in",
            [
              "coalesce",
              ["get", "seamark:rock:water_level"],
              ["get", "seamark:water_level"],
              ["get", "water_level"],
              "",
            ],
            ["literal", ["dry", "part-submerged", "part_submerged"]],
          ],
        ],
      ],
      layout: {
        "icon-overlap": "always",
        "icon-image": "freenauticalchart:obstruction",
        "icon-size": sizeRamp(TOKEN.mark, 11, 0.8),
      },
    },
    {
      id: "rocks",
      type: "symbol",
      source: "seamap",
      "source-layer": "seamark",
      minzoom: 8,
      filter: ["all", ["==", ["get", "type"], "rock"], survivesThinning],
      layout: {
        "icon-overlap": "always",
        // most OSM rocks carry no water_level, and `dry` has no icon: default to submerged, the
        // safe direction and the sprite author's own default
        "icon-image": [
          "match",
          [
            "coalesce",
            ["get", "seamark:rock:water_level"],
            ["get", "seamark:water_level"],
            ["get", "water_level"],
            "",
          ],
          "covers",
          "freenauticalchart:rock-covers",
          "awash",
          "freenauticalchart:rock-awash",
          ["dry", "part-submerged", "part_submerged"],
          "freenauticalchart:rock-dry",
          "freenauticalchart:rock-submerged",
        ],
        "icon-size": sizeRamp(TOKEN.mark, 11),
      },
    },
    {
      id: "floating-barriers",
      type: "line",
      source: "seamap",
      "source-layer": "seamark",
      filter: isFloatingBarrier,
      paint: {
        "line-color": colors.coastline,
        "line-dasharray": [4, 2],
        "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.6, 14, 1.6],
      },
    },
    {
      // the legend is part of the symbology, not decoration: a bare dashed line doesn't say
      // whether it's a boom you can't cross or a limit you can (S-4 B-449.2)
      id: "floating-barriers-label",
      type: "symbol",
      source: "seamap",
      "source-layer": "seamark",
      minzoom: 12,
      filter: isFloatingBarrier,
      layout: {
        "text-field": [
          "case",
          ["has", "name"],
          ["get", "name"],
          ["==", ["get", "category"], "shark_net"],
          "Shark Net",
          "Floating Barrier",
        ],
        "text-font": ["Noto Sans Regular"],
        "text-size": 10,
        "text-offset": [0, -0.8],
        "text-optional": true,
        // "line", not "line-center": a boom long enough to matter is split across tiles, and
        // the clipped halves have no centre to place on
        "symbol-placement": "line",
        "symbol-spacing": 250,
      },
      paint: {
        "text-color": colors.label,
        "text-halo-color": colors.halo,
        "text-halo-width": 1.5,
        "text-halo-blur": 1,
      },
    },
    {
      // minzoom 6 defers to the tile pipeline (SeamarkZoomRules): below zoom 8 the tiles carry
      // only dangerous wrecks, so those appear early without a separate layer split
      id: "obstructions",
      type: "symbol",
      source: "seamap",
      "source-layer": "seamark",
      minzoom: 6,
      filter: [
        "all",
        ["in", ["get", "type"], ["literal", ["wreck", "obstruction"]]],
        survivesThinning,
        // a barrier mapped as a way is its own line; one icon at the centre misstates where it is
        ["any", ["==", ["geometry-type"], "Point"], notFloatingBarrier],
      ],
      layout: {
        "icon-image": [
          "case",
          // foul ground: safe to navigate over, avoid anchoring (FOULGND1, INT 1 K31)
          ["in", ["get", "category"], ["literal", ["foul_ground", "distributed_remains"]]],
          "freenauticalchart:foul",
          ["==", ["get", "type"], "obstruction"],
          "freenauticalchart:obstruction",
          ["==", ["get", "category"], "non-dangerous"],
          "freenauticalchart:wreck-non-dangerous",
          // mast showing = part of the wreck is visible (K25), same family as hull showing
          ["in", ["get", "category"], ["literal", ["hull_showing", "mast_showing"]]],
          "freenauticalchart:wreck-hull_showing",
          // an undescribed wreck must not read as safe: default is dangerous (WRECKS05)
          "freenauticalchart:wreck-dangerous",
        ],
        "icon-overlap": "always",
        "icon-size": sizeRamp(TOKEN.mark, 11),
      },
    },
    {
      // the surveyed least depth over a hazard is the most important thing a chart says about
      // it (S-4 B-420); the sampled surrounding_depth is never printed, only decided on
      id: "hazard-depths",
      type: "symbol",
      source: "seamap",
      "source-layer": "seamark",
      minzoom: 12,
      filter: [
        "all",
        ["in", ["get", "type"], ["literal", HAZARD_TYPES]],
        ["has", "depth"],
        // a negative depth is a drying height, whose underlined notation needs glyph work
        // (tracked with seascape's soundings); don't print a minus sign the chart never uses
        [">=", ["get", "depth"], 0],
      ],
      layout: {
        "text-field": depthText,
        "text-font": ["Noto Sans Italic"],
        "text-size": 10,
        // let the numeral find a clear side of the symbol, like the name labels do
        "text-variable-anchor": ["left", "right", "bottom", "top"],
        "text-radial-offset": 1.7,
        "text-justify": "auto",
        "text-optional": true,
      },
      paint: {
        // black jumps, grey recedes: the sounding emphasis pair (SNDG2/SNDG1)
        "text-color": ["case", ["<=", ["get", "depth"], safety], "#000", colors.chartGrey],
        "text-halo-color": colors.halo,
        "text-halo-width": 1.5,
        "text-halo-blur": 1,
      },
    },
    {
      id: "seabed",
      type: "symbol",
      source: "seamap",
      "source-layer": "seamark",
      filter: ["has", "seamark:seabed_area:surface"],
      layout: {
        // the plain word beats the INT 1 J abbreviation here: "mud" answers the anchoring
        // question instantly, "M" needs a legend the chart doesn't have. The italic is the
        // chart convention that matters — it marks hydrographic text.
        "text-field": ["get", "seamark:seabed_area:surface"],
        "text-font": ["Noto Sans Italic"],
        "text-letter-spacing": 0.1,
        "text-max-width": 5,
        "text-padding": 10,
        "text-size": ["interpolate", ["linear"], ["zoom"], 8, 9, 13, 11],
      },
      paint: {
        "text-color": colors.label,
        "text-halo-color": colors.halo,
        "text-halo-width": 2,
        "text-halo-blur": 1,
      },
    },
  ];
}

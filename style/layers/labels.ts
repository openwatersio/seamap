import type { LayerSpecification } from "@maplibre/maplibre-gl-style-spec";
import { colors } from "./palette.js";
import { anchorOffsets } from "./placement.js";
import { RAMP_FROM, TOKEN, decoration, topOfCell, withinBudget } from "./visibility.js";

const halo = {
  "text-halo-color": colors.halo,
  "text-halo-width": 2,
  "text-halo-blur": 1,
};

/**
 * Named features and the text that names them. These place last, and MapLibre collides symbols in
 * reverse draw order, so everything here outranks the icon layers below it.
 *
 * Order within the group matters for the same reason. A label that changes a decision — a light
 * characteristic, a Racon group — sits after one that only says what something is called, so it
 * places first and a name can never take its room.
 *
 * `landmarks` belongs with the labels rather than with the structures: it and `lights-label` share
 * an anchor point, and since `lights-label` places first a lit landmark would otherwise lose its
 * name entirely. Instead `landmarks` blanks its own name for lit features once `lights-label` is
 * drawing, and `lights-label` stacks name over characteristic. Keep the two together.
 */
export function labels(): LayerSpecification[] {
  return [
    {
      id: "landmarks",
      type: "symbol",
      source: "seamap",
      "source-layer": "seamark",
      // below z10 the tiles carry only the landmarks a mariner steers by — conspicuous, lit,
      // or wind turbines (SeamarkZoomRules)
      minzoom: 6,
      filter: [
        "all",
        ["==", ["get", "type"], "landmark"],
        withinBudget,
        // a bare "tower" with no name, colour or function is not worth a symbol
        [
          "any",
          ["!=", ["get", "category"], "tower"],
          ["has", "color"],
          ["has", "name"],
          [
            "in",
            ["get", "function"],
            ["literal", ["radio", "radar", "television", "light_support", "leading"]],
          ],
        ],
      ],
      layout: {
        "icon-image": [
          "case",
          ["in", ["get", "function"], ["literal", ["church", "chapel"]]],
          "freenauticalchart:church",
          ["==", ["get", "category"], "cairn"],
          "freenauticalchart:cairn-lmk",
          ["==", ["get", "category"], "chimney"],
          "freenauticalchart:chimney",
          ["==", ["get", "category"], "column"],
          "freenauticalchart:column",
          ["==", ["get", "category"], "cross"],
          "freenauticalchart:cross-lmk",
          ["==", ["get", "category"], "dish_aerial"],
          "freenauticalchart:dish_aerial",
          ["==", ["get", "category"], "dome"],
          "freenauticalchart:dome",
          ["==", ["get", "category"], "flagstaff"],
          "freenauticalchart:flagstaff",
          ["==", ["get", "category"], "flare_stack"],
          "freenauticalchart:flare-stack",
          ["==", ["get", "category"], "mast"],
          "freenauticalchart:mast",
          ["==", ["get", "category"], "monument"],
          "freenauticalchart:monument",
          ["==", ["get", "category"], "obelisk"],
          "freenauticalchart:obelisk",
          ["==", ["get", "category"], "radar_scanner"],
          "freenauticalchart:radar_scanner",
          ["==", ["get", "category"], "spire"],
          "freenauticalchart:spire",
          ["==", ["get", "category"], "statue"],
          "freenauticalchart:statue",
          ["==", ["get", "category"], "tower"],
          "freenauticalchart:tower-lmk",
          ["==", ["get", "category"], "windmill"],
          "freenauticalchart:windmill",
          ["==", ["get", "category"], "windmotor"],
          "freenauticalchart:windmotor",
          ["==", ["get", "category"], "windsock"],
          "freenauticalchart:windsock",
          "freenauticalchart:monument",
        ],
        "icon-overlap": "always",
        // A name is a decoration: below the decoration zoom the symbol stands alone, which also
        // keeps landmark labels — placed last, so they win — from taking the space a harbour
        // badge needs. From z12 lights-label draws the name for lit landmarks instead, stacked
        // over the characteristic.
        "text-field": [
          "step",
          ["zoom"],
          "",
          12,
          [
            "case",
            ["any", ["has", "seamark:light:colour"], ["has", "seamark:light:1:colour"]],
            "",
            ["!", topOfCell],
            "",
            ["get", "name"],
          ],
        ],
        "text-size": 12,
        "text-padding": 8,
        "text-font": ["Noto Sans Regular"],
        // One monotone ramp from snug to full clearance, like lights-label: intermediate stops
        // read as the label jumping around its mark. Sprites are 22 x 30 display px at
        // icon-size 1, hence the taller vertical offsets.
        "text-variable-anchor-offset": [
          "interpolate",
          ["linear"],
          ["zoom"],
          RAMP_FROM,
          anchorOffsets(0.85, 0.94),
          16,
          anchorOffsets(1.82, 2.25),
        ],
        "text-justify": "auto",
        "text-optional": true,
        // a conspicuous landmark (CONVIS) draws bolder: it is the one worth steering by
        // CONVIS earns a larger full size, not a different floor: the artwork is the same artwork,
        // so what it can survive shrinking to is the same too
        "icon-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          RAMP_FROM,
          TOKEN.detail,
          12,
          ["case", ["==", ["get", "seamark:landmark:conspicuity"], "conspicuous"], 1.6, 1.3],
        ],
      },
      paint: { "text-color": colors.label, ...halo },
    },
    {
      id: "line_symbols",
      type: "symbol",
      source: "seamap",
      "source-layer": "seamark",
      minzoom: 10,
      filter: ["all", ["has", "name"], ["in", ["get", "type"], ["literal", ["ferry_route"]]]],
      layout: {
        "symbol-placement": "line",
        "text-field": ["get", "name"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 10, 10, 16, 12],
        "text-font": ["Noto Sans Regular"],
      },
      paint: {
        "text-color": ["case", ["==", ["get", "type"], "ferry_route"], colors.ferry, colors.label],
        ...halo,
      },
    },
    {
      id: "seamark-line-label",
      type: "symbol",
      source: "seamap",
      "source-layer": "seamark",
      minzoom: 13,
      filter: [
        "all",
        ["==", ["geometry-type"], "LineString"],
        ["has", "name"],
        // ferry routes are named by line_symbols, in ferry colour and repeating along the line
        ["!", ["in", ["get", "type"], ["literal", ["landmark", "harbour", "ferry_route"]]]],
      ],
      layout: {
        "symbol-placement": "line-center",
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Regular"],
        "text-letter-spacing": 0.1,
        "text-line-height": 1.6,
        "text-max-width": 5,
        "text-offset": [0, -0.65],
        "text-pitch-alignment": "viewport",
        "text-size": ["interpolate", ["linear"], ["zoom"], 13, 10, 16, 13],
      },
      paint: { "text-color": colors.label, ...halo },
    },
    {
      id: "seamark-label",
      type: "symbol",
      source: "seamap",
      "source-layer": "seamark",
      minzoom: 12,
      filter: [
        "all",
        ["==", ["geometry-type"], "Point"],
        ["has", "name"],
        ["!", ["in", ["get", "type"], ["literal", ["landmark", "harbour"]]]],
        withinBudget,
        topOfCell,
      ],
      layout: {
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Regular"],
        "text-justify": "auto",
        "text-size": ["interpolate", ["linear"], ["zoom"], 12, 10, 16, 13],
        "text-padding": 8,
        // mark bodies are bottom-anchored 4px below the position and stack topmarks upward, so a
        // name below the mark needs far less clearance than one above it. Hazards are centred
        // symbols (and can wear the wide isolated-danger octagon), so they take even margins.
        "text-variable-anchor-offset": [
          "interpolate",
          ["linear"],
          ["zoom"],
          12,
          [
            "case",
            ["in", ["get", "type"], ["literal", ["rock", "wreck", "obstruction"]]],
            anchorOffsets(1.7),
            anchorOffsets(1.85, 3.15, 1.15),
          ],
          16,
          [
            "case",
            ["in", ["get", "type"], ["literal", ["rock", "wreck", "obstruction"]]],
            anchorOffsets(1.4),
            anchorOffsets(1.42, 2.42, 0.88),
          ],
        ],
      },
      paint: { "text-color": colors.label, ...halo },
    },
    {
      // an active radar beacon is charted by name with its Morse group, magenta (INT 1 S3.6)
      id: "racon-labels",
      type: "symbol",
      source: "seamap",
      "source-layer": "seamark",
      minzoom: 11,
      filter: ["all", ["has", "radar_transponder"], decoration("characteristic"), withinBudget],
      layout: {
        "text-field": [
          "case",
          ["has", "radar_transponder_group"],
          ["concat", "Racon(", ["get", "radar_transponder_group"], ")"],
          "Racon",
        ],
        "text-font": ["Noto Sans Italic"],
        "text-size": 10,
        "text-anchor": "top",
        // below its host like a subtitle, tracking the body ramp in from a snug start
        "text-offset": [
          "interpolate",
          ["linear"],
          ["zoom"],
          RAMP_FROM,
          ["literal", [0, 0.85]],
          16,
          ["literal", [0, 1.4]],
        ],
        "text-optional": true,
      },
      paint: { "text-color": colors.magenta, ...halo },
    },
    {
      id: "lights-label",
      type: "symbol",
      source: "seamap",
      "source-layer": "seamark",
      minzoom: 11,
      filter: [
        "all",
        ["any", ["has", "seamark:light:colour"], ["has", "seamark:light:1:colour"]],
        decoration("characteristic"),
        withinBudget,
      ],
      layout: {
        // the characteristic sets italic per paper-chart convention (hydrographic text);
        // a lit landmark's name stays roman — it is a fixed structure
        "text-field": [
          "case",
          ["all", ["==", ["get", "type"], "landmark"], ["has", "name"]],
          [
            "format",
            ["get", "name"],
            {},
            "\n",
            {},
            ["get", "light"],
            { "text-font": ["literal", ["Noto Sans Italic"]] },
          ],
          ["format", ["get", "light"], { "text-font": ["literal", ["Noto Sans Italic"]] }],
        ],
        "text-font": ["Noto Sans Regular"],
        "text-justify": "auto",
        "text-size": ["interpolate", ["linear"], ["zoom"], 12, 10, 16, 14],
        "text-padding": 8,
        // Matches the gap `landmarks` leaves off the same symbol, in ems of this layer's
        // text-size. The low stops track the body's size ramp (RAMP_FROM → full at 12): an
        // offset held at its full-size value while the star is still near its floor reads as a
        // label adrift between marks, not attached to one.
        "text-variable-anchor-offset": [
          "interpolate",
          ["linear"],
          ["zoom"],
          RAMP_FROM,
          anchorOffsets(0.3, 1.15),
          16,
          anchorOffsets(1.56, 1.93),
        ],
      },
      paint: { ...halo },
    },
  ];
}

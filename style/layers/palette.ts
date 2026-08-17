/**
 * The chart palette, keyed by job. Day values; dusk/night are same-shaped palettes to add
 * alongside `day` when they exist. Magenta is the chart's reserved "pay attention" channel —
 * aids to navigation, routeing, regulated areas (S-4 §B-435j) — and matches the #ec008c the
 * sprite artwork already uses, so linework and symbols agree.
 */
export const day = {
  background: "#e9f7ff",
  /** one step toward chart buff (NOAA #E4CF8F) for figure-ground against deep water */
  land: "#f5e6bd",
  coastline: "#3d3d3d",
  /** CHBLK — general text */
  label: "#333",
  halo: "rgba(255,255,255,0.8)",
  /** paper-chart magenta, identical to the sprite artwork */
  magenta: "#ec008c",
  /** deliberate departure: S-52 draws conservation areas magenta like all RESARE */
  conservation: "green",
  ferry: "#7c8af6",
  navigationLine: "black",
  recommendedTrack: "gray",
  /** CHGRD chart grey: linework that recedes (deep-hazard boundaries, safe soundings, rapids) */
  chartGrey: "#768c97",
  /** DEPVS shallow-water tint, for hazard-area fills */
  shallowWater: "#61b7ff",
  /** light flare/arc colours, matching the flare sprites (sprites/genicons.py) */
  lightGreen: "#00a650",
  lightRed: "#ed1c24",
  lightYellow: "#fab20b",
  /** grey, not CHBLK black: a busy sector light should not read as a hazard boundary (S-4 B-475.1) */
  sectorLeg: "#666",
} as const;

export type Palette = typeof day;

/** The active palette. */
export const colors: Palette = day;

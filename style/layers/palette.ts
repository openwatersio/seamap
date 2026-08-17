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
  /** CHGRD chart grey: linework that recedes (deep-hazard boundaries, safe soundings) */
  chartGrey: "#768c97",
  /** DEPVS shallow-water tint, for hazard-area fills */
  shallowWater: "#61b7ff",
  /** light flare/arc colours, matching the flare sprites (sprites/genicons.py) */
  lightGreen: "#00a650",
  lightRed: "#ed1c24",
  lightYellow: "#fab20b",
  /** grey, not CHBLK black: a busy sector light should not read as a hazard boundary (S-4 B-475.1) */
  sectorLeg: "#666",
  /** CHBRN built-up areas: one flat urban tint, a step toward chart brown from the land buff */
  urban: "#e8d5a4",
  /** LANDF chart brown: land linework — roads, railways, runways (S-52 draws these brown, never class-coded) */
  landFeature: "#8d642e",
  /** buildings and airport paving, darker than the urban tint they sit on */
  building: "#d9c48e",
  /** minor streets, a warm grey legible on both the land buff and the urban tint */
  street: "#b8b09e",
  /** landcover wash, kept well off the S-52 greens (radar/buoys) and moss-green (intertidal) */
  vegetation: "#dfe5d3",
  /** CHGRD: bridges and overhead crossings — S-52's highest-priority landward linework */
  bridge: "#4c5b63",
  /** DEPIT drying tint, matching seascape's foreshore green: tidal flats the ENC data misses */
  intertidal: "#58af9c",
  /** beaches and dunes, a going-ashore courtesy, slightly lighter than the land buff */
  sand: "#faf2d0",
  /** partly-surveyed water: NODTA blended 50% over seascape's provisional tint */
  noData: "#599ac3",
  /** glaciers: paper charts omit the land tint over ice (S-4 B-353.8) */
  glacier: "#ffffff",
} as const;

export type Palette = typeof day;

/** The active palette. */
export const colors: Palette = day;

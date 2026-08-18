/**
 * The OSM tags this chart reads, as a taginfo project file — so every tag page
 * on taginfo.openstreetmap.org lists Seamap under "Projects" and a mapper can
 * see that their tagging shows up here.
 *
 * Served at https://tiles.openwaters.io/seamap/taginfo.json, which is the URL
 * registered in taginfo/taginfo-projects — moving it costs an upstream PR.
 *
 * `style/taginfo.test.ts` fails when the profile or the style reads a key that
 * isn't listed here.
 *
 * @see https://wiki.openstreetmap.org/wiki/Taginfo/Projects
 */

interface Tag {
  key: string;
  value?: string;
  description?: string;
}

// Every key under seamark:* reaches the tiles (Seamark.java TAG_PREFIXES), and
// the profile resolves the type-specific ones per feature type, so no finite
// list is complete. This is every buoy and beacon the published tiles carry —
// `vector_layers[].fields` in tiles.json lists what the planet build observed.
const MARK_TYPES = [
  "buoy_cardinal",
  "buoy_lateral",
  "buoy_isolated_danger",
  "buoy_safe_water",
  "buoy_special_purpose",
  "buoy_installation",
  "beacon_cardinal",
  "beacon_lateral",
  "beacon_isolated_danger",
  "beacon_safe_water",
  "beacon_special_purpose",
  "beacon_leading",
];

// lightInfo() walks seamark:light:<n>:* from 1 until the colour runs out, so any
// sector number is read; five covers the sectored lights that exist.
const SECTORS = [1, 2, 3, 4, 5];

const LIGHT_SUBKEYS = [
  "colour",
  "character",
  "group",
  "period",
  "height",
  "range",
  "category",
  "multiple",
];

// The abbreviations Fuel.java prints; everything else spells out.
const FUEL_ABBREVIATIONS: Record<string, string> = {
  diesel: "D",
  biodiesel: "BD",
  petrol: "P",
  lpg: "LPG",
  cng: "CNG",
  electricity: "EV",
};

// Fuel.java reads any octane_<number>; these are the grades the planet carries.
const OCTANE_GRADES = [80, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 95, 97, 98, 100];

// The marine-relevant and widely-tagged rest, which land in the label verbatim.
const FUELS_SPELLED_OUT = [
  "marine_diesel",
  "barge_diesel",
  "gasoline",
  "kerosene",
  "e5",
  "e10",
  "e85",
  "adblue",
];

const carried = (keys: string[], description: string): Tag[] =>
  keys.map((key) => ({ key, description }));

export const taginfo = {
  $schema:
    "https://raw.githubusercontent.com/taginfo/taginfo-projects/master/taginfo-project-schema.json",
  data_format: 1,
  data_url: "https://tiles.openwaters.io/seamap/taginfo.json",
  project: {
    name: "Open Waters: Seamap",
    description: "A nautical-themed map with depths, seamarks, and hazards.",
    project_url: "https://openwaters.io/charts/seamap",
    doc_url: "https://github.com/openwatersio/seamap",
    contact_name: "Brandon Keepers",
    contact_email: "brandon@openwaters.io",
  },
  tags: <Tag[]>[
    // ── Plain OSM tagging that puts a feature on the chart ──────────────────
    // Facilities are mapped with ordinary tags far more often than with the
    // duplicate seamark:* ones, so this is the half of the list a mapper is
    // least likely to expect.
    {
      key: "waterway",
      value: "fuel",
      description: "Drawn as a fuel station.",
    },
    {
      key: "waterway",
      value: "water_point",
      description: "Drawn as a drinking water tap.",
    },
    {
      key: "waterway",
      value: "sanitary_dump_station",
      description: "Drawn as a pump-out station.",
    },
    { key: "waterway", value: "boatyard", description: "Drawn as a boatyard." },
    {
      key: "waterway",
      value: "boat_lift",
      description: "Drawn as a boat hoist.",
    },
    {
      key: "waterway",
      value: "access_point",
      description: "Drawn as a small craft access point.",
    },
    {
      key: "amenity",
      value: "boat_rental",
      description: "Drawn as a boat rental.",
    },
    {
      key: "amenity",
      value: "boat_storage",
      description: "Drawn as boat storage.",
    },
    {
      key: "amenity",
      value: "fish_cleaning",
      description: "Drawn as a fish cleaning station.",
    },
    {
      key: "industrial",
      value: "shipyard",
      description: "Drawn as a boatyard.",
    },
    {
      key: "leisure",
      value: "fishing",
      description: "Drawn as a fishing spot.",
    },
    {
      key: "natural",
      value: "beach",
      description: "Drawn as a beach, where small craft can land.",
    },
    ...["sailing", "yachting", "boat"].map((value) => ({
      key: "club",
      value,
      description: "Drawn as a nautical club.",
    })),
    { key: "scout", value: "sea", description: "Drawn as a nautical club." },
    ...["put_in", "egress", "put_in;egress"].map((value) => ({
      key: "canoe",
      value,
      description:
        "Drawn as a small craft access point. Paddlers launch from a bank, which the seamark vocabulary has no word for.",
    })),
    {
      key: "emergency",
      value: "water_rescue",
      description: "Drawn as a rescue station.",
    },
    {
      key: "barrier",
      value: "floating_boom",
      description: "Drawn as a floating barrier: a dashed line with a legend naming it.",
    },
    {
      key: "barrier",
      value: "shark_net",
      description: "Drawn as a floating barrier: a dashed line with a legend naming it.",
    },
    {
      key: "man_made",
      value: "dolphin",
      description: "Drawn as a mooring dolphin.",
    },
    {
      key: "route",
      value: "ferry",
      description: "Ways are drawn as a ferry route.",
    },
    {
      key: "waterway:sign",
      value: "anchor",
      description: "Drawn as an anchorage.",
    },
    {
      key: "power",
      value: "cable",
      description: "Ways also tagged location=underwater are drawn as a submarine cable.",
    },
    {
      key: "man_made",
      value: "pipeline",
      description: "Ways also tagged location=underwater are drawn as a submarine pipeline.",
    },
    {
      key: "location",
      value: "underwater",
      description:
        "Required alongside power=cable or man_made=pipeline for a way to be charted as submarine.",
    },
    {
      key: "substance",
      description:
        "Gives a submarine pipeline (man_made=pipeline + location=underwater) its category.",
    },
    {
      key: "man_made",
      value: "offshore_platform",
      description: "Drawn as an offshore platform.",
    },
    {
      key: "man_made",
      value: "pier",
      description:
        "Drawn as shoreline construction, or as a pontoon when also tagged floating=yes.",
    },
    {
      key: "floating",
      value: "yes",
      description:
        "A pier tagged floating=yes is drawn as a pontoon (PONTON) rather than as fixed shoreline construction.",
    },
    { key: "man_made", value: "groyne", description: "Drawn as a groyne." },
    {
      key: "man_made",
      value: "breakwater",
      description: "Drawn as a breakwater.",
    },
    {
      key: "man_made",
      value: "water_tap",
      description: "Drawn as a drinking water tap.",
    },
    { key: "leisure", value: "slipway", description: "Drawn as a slipway." },
    { key: "historic", value: "wreck", description: "Drawn as a wreck." },
    {
      key: "leisure",
      value: "marina",
      description: "Ways and areas are drawn as a marina.",
    },
    ...["swimming_area", "nature_reserve"].map((value) => ({
      key: "leisure",
      value,
      description: "Areas are drawn as a restricted area.",
    })),
    ...["tower", "windmill", "gasometer"].map((value) => ({
      key: "man_made",
      value,
      description: "Nodes are drawn as a landmark.",
    })),
    ...carried(
      ["tower:type", "windmill:type", "gasometer:type"],
      "Gives a charted landmark its function.",
    ),

    // ── What a fuel dock sells ──────────────────────────────────────────────
    // Fuel.java folds the scatter of fuel:*=yes into one label, because MapLibre
    // can only ask about keys named in advance. Any fuel:* key counts, so this
    // is the set worth linking rather than the whole of it.
    ...Object.entries(FUEL_ABBREVIATIONS).map(([fuel, abbr]) => ({
      key: `fuel:${fuel}`,
      value: "yes",
      description: `Listed on a fuel dock's label as "${abbr}". Only yes counts — fuel:${fuel}=no says the dock has none.`,
    })),
    ...OCTANE_GRADES.map((octane) => ({
      key: `fuel:octane_${octane}`,
      value: "yes",
      description: `Listed on a fuel dock's label as "${octane}", after petrol and in octane order.`,
    })),
    ...FUELS_SPELLED_OUT.map((fuel) => ({
      key: `fuel:${fuel}`,
      value: "yes",
      description:
        "Listed on a fuel dock's label, spelled out — only the most common fuels get an abbreviation.",
    })),

    // ── Water, wetland and waterway ─────────────────────────────────────────
    // Not seamarks: these draw the waters the chart sits on. Depth shading and
    // soundings come from bathymetry, not from OSM.
    {
      key: "natural",
      value: "water",
      description:
        "Areas are charted as a water body, and cut out of the land so the bathymetry below shows through.",
    },
    {
      key: "water",
      description: "Names the kind of water body — lake, reservoir and so on.",
    },
    ...["bay", "strait"].map((value) => ({
      key: "natural",
      value,
      description:
        "Areas are named on the chart in sloping text, the convention for a water feature.",
    })),
    ...["sea", "ocean"].map((value) => ({
      key: "place",
      value,
      description:
        "Areas are named on the chart in sloping text, the convention for a water feature.",
    })),
    ...["wetland", "mud", "shoal"].map((value) => ({
      key: "natural",
      value,
      description:
        "Areas are charted as intertidal ground — the tidal flats, salt marsh and shoals that fall dry between high and low water.",
    })),
    {
      key: "wetland",
      description: "Gives an intertidal area its category, e.g. tidalflat or saltmarsh.",
    },
    {
      key: "surface",
      description: "Charted as the nature of the ground over an intertidal area.",
    },
    {
      key: "waterway",
      description:
        "Ways are charted as a waterway. Rivers, canals and fairways appear first, then locks, docks, streams and tidal channels; ditches and drains only when zoomed well in.",
    },

    // ── The seamark vocabulary ──────────────────────────────────────────────
    {
      key: "seamark:type",
      description:
        "Selects the chart symbol. Every seamark:* key on the feature reaches the tiles, and the profile resolves the type-specific ones — seamark:<type>:colour, :shape, :category and so on.",
    },
    {
      key: "seamark:type",
      value: "light_major",
      description:
        "Charted as a major light: its height and nominal range are printed alongside the characteristic. A light of 10 M or more is treated the same way.",
    },
    ...MARK_TYPES.flatMap((type): Tag[] => [
      {
        key: `seamark:${type}:category`,
        description: "Selects the chart symbol, and supplies the IALA default colour and topmark.",
      },
      {
        key: `seamark:${type}:colour`,
        description: "Colours the mark. Falls back to the IALA default for its category.",
      },
      {
        key: `seamark:${type}:colour_pattern`,
        description: "Draws the mark's colours as horizontal bands or vertical stripes.",
      },
      {
        key: `seamark:${type}:shape`,
        description:
          "Draws the mark's body. Falls back to a pillar buoy or a pile beacon, and to a can or cone for a lateral buoy.",
      },
      {
        key: `seamark:${type}:reflectivity`,
        description:
          "A conspicuous mark, or one tagged as carrying a reflector, is drawn with the radar reflector caret.",
      },
    ]),
    ...carried(
      ["seamark:name", "seamark:category", "seamark:function", "seamark:depth"],
      "Read as the fallback when the type-specific key (seamark:<type>:name and so on) is absent.",
    ),
    ...carried(
      ["seamark:topmark:shape", "seamark:topmark:colour", "seamark:topmark:colour_pattern"],
      "Draws the topmark above the mark. Falls back to the IALA default for cardinal, isolated danger and safe water marks.",
    ),
    ...carried(
      ["seamark:daymark:shape", "seamark:daymark:colour"],
      "Drawn as the topmark when no seamark:topmark:* tagging is present.",
    ),
    ...LIGHT_SUBKEYS.map((sub) => ({
      key: `seamark:light:${sub}`,
      description: "Printed as part of the light characteristic, e.g. Fl(2)W.12s35m15M.",
    })),
    ...SECTORS.flatMap((n) =>
      LIGHT_SUBKEYS.map((sub) => ({
        key: `seamark:light:${n}:${sub}`,
        description: `Sector ${n} of a sectored light. Same as seamark:light:${sub}=*; see that key.`,
      })),
    ),
    ...carried(
      ["seamark:fog_signal:category", "seamark:fog_signal:group", "seamark:fog_signal:period"],
      "Printed as the fog signal alongside the light characteristic.",
    ),
    ...carried(
      ["seamark:radar_transponder:category", "seamark:radar_transponder:group"],
      "Charted as a racon with its Morse identification group.",
    ),
    {
      key: "seamark:radar_reflector",
      value: "yes",
      description:
        "Draws the radar reflector caret on the mark. Only yes is read; a reflector is otherwise tagged seamark:<type>:reflectivity=*.",
    },
    {
      key: "seamark:radio_station:category",
      description: "Charted as a radio station. Every seamark:radio_station:* key is carried.",
    },
    ...carried(
      ["seamark:pipeline_submarine:category", "seamark:pipeline_submarine:product"],
      "Describes what a submarine pipeline carries.",
    ),
    ...carried(
      [
        "seamark:water_level",
        "seamark:rock:water_level",
        "seamark:wreck:water_level",
        "seamark:shoreline_construction:water_level",
        "water_level",
      ],
      "Decides whether a rock, wreck or wall is drawn as submerged, awash, covering or dry — and whether a wreck counts as dangerous.",
    ),
    ...carried(
      ["seamark:restriction", "restriction"],
      "Drawn as the restriction symbol on a restricted area. The type-specific seamark:<type>:restriction is read too.",
    ),
    {
      key: "seamark:seabed_area:surface",
      description: "Charted as the seabed's nature — sand, mud, rock and so on.",
    },
    {
      key: "seamark:landmark:conspicuity",
      description: "A conspicuous landmark is charted at a lower zoom than an inconspicuous one.",
    },

    // ── Attributes carried into the tiles ───────────────────────────────────
    // Seamark.java TAG_WHITELIST: available to the style without a planet
    // rebuild, whether or not a layer reads them yet.
    {
      key: "access",
      description:
        "access=no, private, permit or customers marks a structure as not open to the public.",
    },
    ...carried(
      ["ref", "description", "note"],
      "Carried into the tiles as detail about the feature. Nothing on the chart draws them yet — labels come from name=* and its seamark equivalents.",
    ),
    {
      key: "name",
      description:
        "Used to label the feature, after seamark:name=* and the type-specific seamark:<type>:name=*. Localized name:<lang>=* variants are carried into the tiles for downstream styles, though the chart's own labels don't read them yet.",
    },
    ...carried(
      ["fee", "charge", "toll", "opening_hours", "operator", "vhf"],
      "Carried into the tiles as detail about a facility.",
    ),
    ...carried(
      ["operator:wikidata", "wikidata", "wikipedia"],
      "Carried into the tiles; identifies the operator of a facility.",
    ),
    ...carried(
      ["maxdraft", "maxlength", "maxwidth", "maxheight", "maxweight", "maxspeed", "maxstay"],
      "Carried into the tiles as a constraint on the vessels a berth or passage takes.",
    ),
    ...carried(
      ["direction", "distance"],
      "Carried into the tiles; orients a directional mark and spaces the marks along a route.",
    ),
    ...carried(
      ["vessel", "vessel:mmsi"],
      "Carried into the tiles; identifies a permanently moored vessel.",
    ),
    ...carried(
      ["wreck:type", "wreck:date_sunk"],
      "Carried into the tiles as detail about a wreck.",
    ),
    {
      key: "building:height",
      description: "Carried into the tiles as the height of a charted structure.",
    },
    {
      key: "highway",
      description: "Carried into the tiles; distinguishes a road bridge from other crossings.",
    },
    {
      key: "depth",
      description:
        "Read as the fallback for a feature's surveyed depth, after seamark:<type>:depth=* and seamark:depth=*.",
    },
    ...carried(
      ["category", "function"],
      "Read as the fallback after the seamark:<type>:* and seamark:* forms of the same key.",
    ),
  ],
};

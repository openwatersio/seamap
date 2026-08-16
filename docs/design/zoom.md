# Zoom rules and the navigational purpose bands

[`SeamarkZoomRules.java`](../../src/main/java/SeamarkZoomRules.java) assigns minimum zooms using the standards' scale framework. This document explains that framework, compares the implementation with the derived values, and records each deliberate departure. The final section lists the remaining open decisions.

## The framework: two scale mechanisms, then a hazard override

An ECDIS decides what exists at a given scale in two stages. A separate contextual rule can then promote an isolated danger. This chart needs all three decisions.

**1. Band compilation decides existence.** ENCs are compiled per navigational purpose (S-57 "INTU"), six bands with recommended scale ranges (S-11 §3.4.3). In Web Mercator zooms (equatorial, round up at our latitudes):

| Band | Purpose  | Scales          | ≈ zooms |
| ---- | -------- | --------------- | ------- |
| 1    | Overview | < 1:1,499,999   | ≤ z8    |
| 2    | General  | 1:350k – 1:1.5M | z9–10   |
| 3    | Coastal  | 1:90k – 1:350k  | z11–12  |
| 4    | Approach | 1:22k – 1:90k   | z13–14  |
| 5    | Harbour  | 1:4k – 1:22k    | z15–17  |
| 6    | Berthing | > 1:4k          | z18+    |

A feature omitted from the General cell does not exist at z9, regardless of its SCAMIN. S-4 generalization determines what enters a small-scale cell:

- **B-403.1(d)**: drying rocks and islets are "particularly dangerous in isolation and must then be shown as precisely as possible"; where they occur **in groups a selection of representative symbols is permissible, showing the outermost ones**. Isolation earns precision; groups get representatives, chosen seaward-first.
- **B-404**: inshore of a natural line — harbour entrances, the outer edge of an archipelago — small-scale charts use _minimal depiction_: omit "soundings, wrecks, buoys and other short range navigational aids" (B-404.3), keep the coastline, generalized contours, and "long range navigational aids of use to the mariner navigating the outer parts of the chart" (B-404.2).
- **B-402.1**: this is deliberate pedagogy — generalization exists partly "to induce navigators … to use larger scale charts".

**2. SCAMIN decides retention.** Once a cell contains a feature, SCAMIN determines how far it remains visible while zooming out (S-57 UOC §2.2.7.1). It assigns one to four steps toward smaller scales from the compilation scale of the smallest-scale cell containing the feature. More steps retain it farther out; NOT SET means all scales. One step is roughly half to one web-map zoom. UOC Table 2.5 gives these values for the classes used here:

| Steps                | Classes                                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| NOT SET (all scales) | dangerous `UWTROC`/`WRECKS`/`OBSTRN`, TSS lines/boundaries/lanes, conspicuous landmarks and piles, `MORFAC` base                                                         |
| 4                    | `LIGHTS`, isolated-danger buoys/beacons, cautionary areas, deep rocks (`VALSOU` > 30), uncovered platforms                                                               |
| 3                    | lateral/cardinal/safe-water/special buoys and beacons, topmarks, fog signals, racons, fairways, restricted areas, radar-conspicuous landmarks, dangerous-category wrecks |
| 2                    | anchorage areas, cable areas, hazards covered by an `OBSTRN` group area, moorings (alternate row), plain piles                                                           |
| 1                    | anchor berths, **harbour facilities**, small-craft facilities, plain landmarks, `SBDARE`, marine farms (base)                                                            |

The conditions matter. `UWTROC` is NOT SET when it is dangerous; a depth greater than 30 m reduces it to four steps, and membership in a covered group reduces it to two. Danger is contextual, not merely a property of the feature type.

**3. ECDIS encodes "the shore is the danger."** This is a contextual rule that builds on the first two stages. The isolated-danger procedure (`UDWHAZ05`, S-52 §13.2.19) promotes a hazard to the magenta symbol, priority 8, display base, and infinite SCAMIN only when both conditions hold: the hazard is shoaler than the safety contour, and its surrounding water is deeper than that contour. The hazard contradicts otherwise safe water. A rock already inside the unsafe tint receives no promotion and remains suppressible under its ordinary SCAMIN.

The tiles carry this decision's inputs in S-52's own vocabulary, both DEM-derived ([`Seamark.java`](../../src/main/java/Seamark.java)): `seabed_depth` is one bilinear sample at the hazard — the stand-in for a missing surveyed depth, S-52's `SEABED_DEPTH` — and `surrounding_depth` is the shallowest _water_ on a 250 m ring, the neighbourhood figure a point sample cannot give because its pixel may be reading the hazard itself. The style's isolated-danger ring runs the full two-sided test on them (shoal, in navigable surround, not on the shore fringe), which is what keeps a rock in a coastal fringe from ringing: the water around it is itself too shallow to enter, so it contradicts nothing the shore doesn't already say. Only the shore ring and the charted depth feed the _minzoom_ — a hard exclusion gets the most conservative inputs.

## Current state

“Derived” combines the home-band floor with the class's SCAMIN steps: the first zoom at which the standards would show the feature, assuming coverage in every band. Each departure includes its rationale so a later audit does not have to reconstruct or relitigate the decision.

The derived floor is not documentation-only: `SeamarkZoomRules.getStandardMinZoom` bakes it into every `seamark` and `light` feature as `std_minzoom` (0 = SCAMIN NOT SET), and the style's standards mode thresholds on it at runtime ([`index.ts`](../../style/layers/index.ts)). The tile floor stays the Minzoom column — everywhere at or below the derived value, so the strict filter always has the feature to work with. The one exception runs the other way: an all-scales class (`std_minzoom` 0) still only exists from its tile floor, so standards mode shows TSS linework from z2 and conspicuous landmarks from z6, not from z0.

| Type(s)                                       | Minzoom                    | Derived                          | Note                                                                                                                                                                                                                                    |
| --------------------------------------------- | -------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TSS lanes / lines / boundaries                | 2                          | any (NOT SET)                    | ✓ the linework is the passage-planning signal and NOT SET licenses any floor; z2 matches OpenSeaMap-vector                                                                                                                              |
| TSS zone / crossing / roundabout              | 4                          | any (NOT SET)                    | ✓ the fills lag the linework: low-opacity magenta over Overview-scale sea reads as haze, not a scheme                                                                                                                                   |
| `light_major`; any light ≥ 15 M               | 4                          | z5                               | ✓ one zoom early for the landfall class                                                                                                                                                                                                 |
| any light ≥ 10 M                              | 6                          | z6–7                             | ✓ the S-52 major-light test; range only promotes, never demotes                                                                                                                                                                         |
| `light_minor`, unranged                       | 8                          | z11                              | early: a light is what makes night approach possible, and its host may be under-typed                                                                                                                                                   |
| `fog_signal`                                  | 10                         | z12                              | close; the style gates the decoration at z11 anyway                                                                                                                                                                                     |
| `platform`                                    | 4                          | z5–9                             | sparse and conspicuous                                                                                                                                                                                                                  |
| restricted areas                              | 4                          | z6–10 by extent                  | area fills, not symbols — never thinned, cheap to carry                                                                                                                                                                                 |
| `anchorage`                                   | 9                          | z12                              | early: an anchorage is a planning destination like a harbour                                                                                                                                                                            |
| `cable_area`, `pipeline_area`, `marine_farm`  | 4                          | z10–12                           | **still early** — untouched pending a look at how their area fills read at z4–8                                                                                                                                                         |
| cardinal / isolated-danger / safe-water marks | 6                          | z9–10                            | early: these mark dangers, and the hazard-first principle keeps danger marks ahead of their band                                                                                                                                        |
| lateral / special buoys & beacons             | 10                         | z12–14                           | early: a channel's presence is worth reading at z10; z4–8 had no defense                                                                                                                                                                |
| `mooring`                                     | 13                         | z14                              | ✓                                                                                                                                                                                                                                       |
| `rock` / `wreck` / `obstruction`              | contextual 6 / 8 / 11 / 13 | contextual                       | dangerous wreck 6; clear of shore and dangerous-or-uncharted 8; charted > `MAX_SAFETY_DEPTH` 11; `near_shore` 13. The deep threshold is the deepest supported safety setting because a minzoom is a hard floor no exemption can recover |
| `harbour`                                     | 8                          | z11–13                           | early: harbours are this chart's planning anchors (B-402.3d licenses small-scale planning use)                                                                                                                                          |
| `landmark`, plain                             | 10                         | z11                              | ✓                                                                                                                                                                                                                                       |
| `landmark` conspicuous / lit / wind turbine   | 6                          | any (NOT SET when CONVIS or lit) | the turbine exception is by category — the conspicuity tag is rarely mapped, and without it a wind farm is empty sea below z10                                                                                                          |
| `small_craft_facility`                        | 14                         | z15                              | ✓                                                                                                                                                                                                                                       |

Shore proximity (`near_shore`) is a ring of sixteen DEM samples at 250 m ([`DepthCalculator.ringStats`](../../src/main/java/DepthCalculator.java), land clamps to depth 0), flagged at 3/16 land: a coastline within the radius subtends at least that arc, an isolated drying rock or islet under ~100 m across never does — so offshore skerries keep their early floor. Sixteen samples, not eight: a rock 100–200 m off a straight coast sits near the threshold, and coarser sampling put exactly that population on a coin flip.

## Deferred

**Seaward-first selection for shore-adjacent hazard groups.** [`SeamarkPriority`](../../src/main/java/SeamarkPriority.java) ranks hazards shoalest-first, which is right for open-water fields but keeps the wrong member of a fringe along a coast: the shoalest rock is usually the _innermost_, and B-403.1(d) selects the **outermost** — the one a vessel approaching from seaward meets first. The shore ring supplies the signal for free (which samples read land gives the bearing of the coast; land fraction is a coarse inverse distance). Prototype only if the near-shore deferral proves insufficient: it already removes most of the population this would reorder from the zooms where the ordering mattered.

**Cable, pipeline, and farm areas at z4.** This is the only row still using the old defaults. Their fills are cheap and unthinned, but z4 is Overview scale and a marine farm is not an Overview feature. Decide after a visual review of the area fills at low zoom.

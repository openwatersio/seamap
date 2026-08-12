# Zoom rules and the navigational purpose bands

[`SeamarkZoomRules.java`](../../src/main/java/SeamarkZoomRules.java) assigns minzooms against the scale framework the standards use, with deliberate departures recorded here. The framework is the reference half of this doc; the table is the current state, one column being what the standards would derive; the deferred items at the end are the only work still open.

## The framework: two mechanisms, not one

What an ECDIS shows at a given scale is decided twice, and both halves matter here.

**1. Band compilation decides existence.** ENCs are compiled per navigational purpose (S-57 "INTU"), six bands with recommended scale ranges (S-11 §3.4.3). In Web Mercator zooms (equatorial, round up at our latitudes):

| Band | Purpose  | Scales          | ≈ zooms |
| ---- | -------- | --------------- | ------- |
| 1    | Overview | < 1:1,499,999   | ≤ z8    |
| 2    | General  | 1:350k – 1:1.5M | z9–10   |
| 3    | Coastal  | 1:90k – 1:350k  | z11–12  |
| 4    | Approach | 1:22k – 1:90k   | z13–14  |
| 5    | Harbour  | 1:4k – 1:22k    | z15–17  |
| 6    | Berthing | > 1:4k          | z18+    |

A feature absent from the General cell simply does not exist at z9, whatever its SCAMIN. What gets _into_ a small-scale cell is S-4 generalization:

- **B-403.1(d)**: drying rocks and islets are "particularly dangerous in isolation and must then be shown as precisely as possible"; where they occur **in groups a selection of representative symbols is permissible, showing the outermost ones**. Isolation earns precision; groups get representatives, chosen seaward-first.
- **B-404**: inshore of a natural line — harbour entrances, the outer edge of an archipelago — small-scale charts use _minimal depiction_: omit "soundings, wrecks, buoys and other short range navigational aids" (B-404.3), keep the coastline, generalized contours, and "long range navigational aids of use to the mariner navigating the outer parts of the chart" (B-404.2).
- **B-402.1**: this is deliberate pedagogy — generalization exists partly "to induce navigators … to use larger scale charts".

**2. SCAMIN decides retention.** Within cells that do carry the feature, SCAMIN says how far past its band it stays visible when zooming out (S-57 UOC §2.2.7.1): 1–4 "steps" toward smaller scales from the compilation scale of the smallest-scale cell the feature appears on, where more steps = retained further out, and NOT SET = every scale. One step ≈ half a zoom to one zoom. Steps for our classes (UOC Table 2.5):

| Steps                | Classes                                                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| NOT SET (all scales) | dangerous `UWTROC`/`WRECKS`/`OBSTRN`, TSS lines/boundaries/lanes, conspicuous landmarks and piles, `MORFAC` base                                                   |
| 4                    | `LIGHTS`, isolated-danger buoys/beacons, cautionary areas, deep rocks (`VALSOU` > 30), uncovered platforms                                                         |
| 3                    | lateral/cardinal/safe-water/special buoys and beacons, topmarks, fog signals, racons, fairways, restricted areas, radar-conspicuous landmarks, dangerous-category wrecks |
| 2                    | anchorage areas, cable areas, hazards covered by an `OBSTRN` group area, moorings (alternate row), plain piles                                                     |
| 1                    | anchor berths, **harbour facilities**, small-craft facilities, plain landmarks, `SBDARE`, marine farms (base)                                                      |

Note what the conditions do: `UWTROC` is NOT SET _because dangerous_, and its conditions demote — deeper than 30 m drops it to 4 steps, membership in a covered group drops it to 2. Danger is contextual, not typological.

**3. ECDIS encodes "the shore is the danger".** The isolated-danger promotion (`UDWHAZ05`, S-52 §13.2.19) grants a hazard the magenta symbol, priority 8, display base, and **SCAMIN = infinite** only when it is shoaler than the safety contour **and lies in water deeper than the safety contour** — a contradiction of the surrounding "safe" water. A rock inside the unsafe tint gets none of that: viewing group 34050, "not a danger to own-ship's navigation", ordinary SCAMIN, suppressible.

The tiles carry this decision's inputs in S-52's own vocabulary, both DEM-derived ([`Seamark.java`](../../src/main/java/Seamark.java)): `seabed_depth` is one bilinear sample at the hazard — the stand-in for a missing surveyed depth, S-52's `SEABED_DEPTH` — and `surrounding_depth` is the shallowest _water_ on a 250 m ring, the neighbourhood figure a point sample cannot give because its pixel may be reading the hazard itself. The style's isolated-danger ring runs the full two-sided test on them (shoal, in navigable surround, not on the shore fringe), which is what keeps a rock in a coastal fringe from ringing: the water around it is itself too shallow to enter, so it contradicts nothing the shore doesn't already say. Only the shore ring and the charted depth feed the _minzoom_ — a hard exclusion gets the most conservative inputs.

## Current state

"Derived" = home-band floor plus the class's SCAMIN steps, i.e. where the standards would first show it, assuming coverage in every band. Departures from the derivation are deliberate and say why; they exist so the next audit doesn't relitigate them.

| Type(s)                                       | Minzoom                   | Derived              | Note                                                                                                                                                                                                              |
| --------------------------------------------- | ------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TSS (`separation_*`)                          | 4                         | any (NOT SET)        | ✓                                                                                                                                                                                                                  |
| `light_major`; any light ≥ 15 M               | 4                         | z5                   | ✓ one zoom early for the landfall class                                                                                                                                                                            |
| any light ≥ 10 M                              | 6                         | z6–7                 | ✓ the S-52 major-light test; range only promotes, never demotes                                                                                                                                                    |
| `light_minor`, unranged                       | 8                         | z11                  | early: a light is what makes night approach possible, and its host may be under-typed                                                                                                                              |
| `fog_signal`                                  | 10                        | z12                  | close; the style gates the decoration at z11 anyway                                                                                                                                                                |
| `platform`                                    | 4                         | z5–9                 | sparse and conspicuous                                                                                                                                                                                             |
| restricted areas                              | 4                         | z6–10 by extent      | area fills, not symbols — never thinned, cheap to carry                                                                                                                                                            |
| `anchorage`                                   | 9                         | z12                  | early: an anchorage is a planning destination like a harbour                                                                                                                                                       |
| `cable_area`, `pipeline_area`, `marine_farm`  | 4                         | z10–12               | **still early** — untouched pending a look at how their area fills read at z4–8                                                                                                                                    |
| cardinal / isolated-danger / safe-water marks | 6                         | z9–10                | early: these mark dangers, and the hazard-first principle keeps danger marks ahead of their band                                                                                                                   |
| lateral / special buoys & beacons             | 10                        | z12–14               | early: a channel's presence is worth reading at z10; z4–8 had no defense                                                                                                                                           |
| `mooring`                                     | 13                        | z14                  | ✓                                                                                                                                                                                                                  |
| `rock` / `wreck` / `obstruction`              | contextual 6 / 8 / 11 / 13 | contextual           | dangerous wreck 6; clear of shore and dangerous-or-uncharted 8; charted > `MAX_SAFETY_DEPTH` 11; `near_shore` 13. The deep threshold is the deepest supported safety setting because a minzoom is a hard floor no exemption can recover |
| `harbour`                                     | 8                         | z11–13               | early: harbours are this chart's planning anchors (B-402.3d licenses small-scale planning use)                                                                                                                     |
| `landmark`, plain                             | 10                        | z11                  | ✓                                                                                                                                                                                                                  |
| `landmark` conspicuous / lit / wind turbine   | 6                         | any (NOT SET when CONVIS or lit) | the turbine exception is by category — the conspicuity tag is rarely mapped, and without it a wind farm is empty sea below z10                                                                          |
| `small_craft_facility`                        | 14                        | z15                  | ✓                                                                                                                                                                                                                  |

Shore proximity (`near_shore`) is a ring of sixteen DEM samples at 250 m ([`DepthCalculator.ringStats`](../../src/main/java/DepthCalculator.java), land clamps to depth 0), flagged at 3/16 land: a coastline within the radius subtends at least that arc, an isolated drying rock or islet under ~100 m across never does — so offshore skerries keep their early floor. Sixteen samples, not eight: a rock 100–200 m off a straight coast sits near the threshold, and coarser sampling put exactly that population on a coin flip.

## Deferred

**Seaward-first selection for shore-adjacent hazard groups.** [`SeamarkPriority`](../../src/main/java/SeamarkPriority.java) ranks hazards shoalest-first, which is right for open-water fields but keeps the wrong member of a fringe along a coast: the shoalest rock is usually the _innermost_, and B-403.1(d) selects the **outermost** — the one a vessel approaching from seaward meets first. The shore ring supplies the signal for free (which samples read land gives the bearing of the coast; land fraction is a coarse inverse distance). Prototype only if the near-shore deferral proves insufficient: it already removes most of the population this would reorder from the zooms where the ordering mattered.

**Cable, pipeline and farm areas at z4.** The one row of the table still standing on the old defaults. Their fills are cheap and unthinned, but z4 is Overview scale and a marine farm is not an Overview feature; decide alongside a visual pass on how area fills read at low zoom.

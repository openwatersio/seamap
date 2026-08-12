# What draws when symbols overlap

A chart that draws every feature above its zoom threshold, at whatever size its ramp specifies, has no hierarchy. This chart answers three separate questions:

1. **May this feature appear at this zoom at all?** A class floor, absolute and per type — a fish-cleaning table has no business existing at z10 at any density.
2. **Is there room for it here?** A density budget, per presentation family, per grid cell — rank within the cell decides who spends it.
3. **How much of it draws?** A surviving mark is dressed or bare — body with its decorations, or body alone — and its size reads as its prominence.

These questions are independent. Conflating them produces a wind farm that is a black mat at z8 and empty water at z7: one class threshold is being asked to control density, with no state between "none" and "all."

## Three axes, each with one home

| Axis       | Question                             | Lives in                                                    | Controls                                                              |
| ---------- | ------------------------------------ | ----------------------------------------------------------- | --------------------------------------------------------------------- |
| **Family** | whose budget do you spend            | tiles (`family`)                                            | the per-family budgets that stop a harbour competing with forty buoys |
| **Rank**   | who wins within a family             | tiles (`cell_rank`)                                         | presence order, decoration fit, label eligibility                     |
| **Token**  | how far the artwork survives scaling | style ([`visibility.ts`](../../style/layers/visibility.ts)) | the size floor                                                        |

**Rank and token are independent.** A magenta harbour disc remains legible when very small but has middling importance; a cardinal buoy needs more pixels but has high importance. One value cannot serve both: shrinkability belongs to the artwork, while importance belongs to the feature.

### Family and rank

[`SeamarkPriority.java`](../../src/main/java/SeamarkPriority.java) assigns every point to one of six presentation families: `hazard`, `major_aid`, `minor_aid`, `harbour`, `structure`, or `facility`. This deliberately small taxonomy replaces roughly 200 raw `seamark:type` values for decluttering purposes.

The first five families have density budgets. A harbour badge and the buoys around it therefore spend different allowances and cannot displace one another. `facility` sits at the bottom of the hierarchy and has no density budget; collision thins its amenity badges instead. The destructive tile cap still bounds the number carried in the tiles.

Within a family, `rank` orders by tier and then by instance: a beacon above a buoy (a beacon holds its charted position, a buoy can drag off station — S-4 §B-455.3), a conspicuous landmark above a plain one (CONVIS is what a mariner steers by), longer light reach above shorter (with S-52's 10 M major-light test promoting a long-range light into `major_aid` however its host is typed), a shallower hazard above a deeper one within severity bands (what you cannot see is worse), and a named marina above an anonymous basin.

Rank is static. Whether a hazard is critical depends on the mariner's safety depth, which only the style knows; that decision stays there (see the safety exemption below).

### `cell_rank`

`postProcessTileFeatures` ([`Seamap.java`](../../src/main/java/Seamap.java)) runs once per output tile at each zoom. Within every 32-pixel grid cell, it sorts the points in each family and writes their zero-based position as `cell_rank`. The geographic area covered by a cell changes with zoom, so it might contain one buoy at z14 and forty at z8; each tile build ranks the population visible at that zoom.

`cell_rank` is a local ordinal, not global prominence: the best feature in every cell is rank 0. That is exactly what a budget threshold needs and all it should be used for; it is also a serviceable local tiebreak on the bottom-tier collision layers, where an arbitrary loser is acceptable anyway.

Behind the numbering is a destructive storage cap (`cellCap`): 8 features per family and cell below z11, 16 below z13, and unlimited from z13. Safety-retained hazards may exceed it. The cap is a storage backstop, not the ordinary selection mechanism; it stays above every style budget so those budgets can be retuned without rebuilding the planet. A cell is split at tile boundaries, so a feature can rank differently on either side of a seam. This is the same artifact produced by label grids and is acceptable at this cell size.

## Existence: the class floor

[`SeamarkZoomRules.java`](../../src/main/java/SeamarkZoomRules.java) decides the earliest zoom a feature may appear, derived from the S-57 navigational purpose bands plus the class's SCAMIN steps, with deliberate deviations recorded where the derivation gives the wrong answer for this chart. The framework, the full minzoom table, and each departure's rationale live in [zoom.md](zoom.md). A floor has to be honest in both directions: a fish-cleaning table in a z8 tile is bytes nothing will ever draw, and a channel buoy at z4 is Harbour-band furniture on an Overview chart.

Hazards get a contextual floor, not a typological one, because the standards decide danger contextually twice over — ECDIS promotes a hazard past every scale threshold only when it contradicts navigable water around it (S-52's isolated-danger test), and S-4 §B-404 omits near-shore dangers from small-scale charts entirely, because inshore of the natural line the shore itself is the danger. So: a wreck categorized dangerous appears from z6; a hazard near the shore (`near_shore`, sampled from the DEM at build time) waits for z13, since a rock twenty metres off a coast at overview scale sits inside the coastline's own line weight; a hazard charted deeper than every supported safety depth waits for z11; everything else — dangerous, or uncharted and assumed so — appears from z8.

Floors decide _may_; budgets decide _does_. Once a feature clears its floor, its presence is decided by rank within the cell, not by another class threshold.

## Presence: the budget

The style thresholds `cell_rank` per family and zoom band ([`visibility.ts`](../../style/layers/visibility.ts), `withinBudget`): how many hazards, major aids, minor aids, harbours and structures a cell keeps below z9, from z9, from z11, and from z13 (where the answer becomes "all the tile has"). Because the thresholds are style expressions, the most-tuned numbers on the chart cost a page reload rather than a planet build — this is Mapbox's `filterrank` model.

This mechanism has four useful consequences:

- **One of each kind beats all of one kind.** Budgets are per family, so a place with a marina and forty buoys shows the marina and some buoys, not forty-one buoys.
- **The lowest band is much tighter than a linear reading suggests.** A cell covers a huge amount of ground at z7 and every family draws a real symbol there, so a handful fills the space. A size floor and a budget must move together: raising a family's floor without tightening its low-zoom budget just draws the same crowd larger.
- **Harbours keep a budget of one below z11** so that rank picks the survivor — the named marina — rather than leaving the choice to whatever the collision grid reaches first, which keeps an anonymous basin and drops the marina beside it.
- **Lines and areas are never thinned.** They hold no position in a cell; `cell_rank` applies to points.

**The safety-depth exemption.** A hazard whose known depth puts it at or above the mariner's safety depth is exempt from its family budget entirely — it draws whatever its `cell_rank` says ([`hazards.ts`](../../style/layers/hazards.ts)). The pipeline guarantees the style can honor this: any hazard shallow enough, or unsurveyed enough, to fall inside a supported safety depth rides past the destructive cap (`SeamarkPriority.neverCapped`), because the style cannot exempt a feature it was never sent. `MAX_SAFETY_DEPTH` (30 m) bounds the supported settings; a safety depth beyond it would silently lose hazards the tiles no longer carry, and is not supported.

## Collision is for the bottom of the hierarchy; thinning keeps a composed symbol whole

MapLibre resolves collisions per layer, while a composed paper symbol spans several layers. A lit cardinal buoy, for example, has a body, topmark, reflector, and flare. Independent collision can place the body but drop the topmark, or leave a flare without its body. Shared `cell_rank` filters avoid that failure: all parts pass or fail the same density test.

So collision is only for the bottom of the hierarchy, where losing a contest is acceptable. Cranes, rescue stations and radar stations (`structure` family) get both treatments: the budget thins the crowd, and collision arbitrates whoever remains, with `symbol-sort-key` on `cell_rank` so the loser is the lowest-ranked rather than an arbitrary one. Small-craft facilities (`facility` family) skip the budget entirely and are thinned by collision alone — a harbour with 146 slipways declutters instead of becoming a wall of discs, and any surviving badge is as good as any other. Everything above keeps `icon-overlap: "always"` and is governed by its budget. That also settles the cross-class hierarchy without touching paint order: guaranteed placement means a hazard or a cardinal can never lose a contest to a marina badge, which is the only thing reordering the draw stack would have bought.

Two traps worth naming:

- MapLibre places symbols in **reverse draw order** — the last layer places first. Placement priority is layer order read backwards.
- `symbol-sort-key` means opposite things depending on `icon-overlap`: with overlap off the lower key wins placement; with overlap on the higher key draws on top. Set it only on layers that collide.

## A mark is dressed or bare — never substituted

A mark has two states: its body with decorations, or its body alone. Decorations include the topmark, radar reflector, light flare, name, and descriptive text. There is no third state in which another symbol replaces it. A generic dot carries no class meaning; a reduced body still says "cardinal buoy" through shape and color, even if the reader must zoom to identify which cardinal. This is invariant 4 in the [design charter](README.md).

**A decoration draws when it is legible and it fits. Both, and nothing else.**

_Legible_ is a real floor, not a declutter knob: below the size where a topmark's cones separate, it is a smudge that says something false about the mark. Each decoration kind has its own floor (`LEGIBLE_FROM` in [`visibility.ts`](../../style/layers/visibility.ts)), following from where the body's size ramp carries it past readable — not from a blanket declutter zoom, which would withhold the topmarks of two cardinals alone in an empty view for no reason at all.

_Fits_ cannot be collision, structurally: a decoration is anchored a few pixels from its own body, so to the collision grid it always intersects the mark it belongs to — opting a topmark into collision draws none of them, anywhere, ever. So every part keeps guaranteed placement, and fit rides the same per-cell budget as the body: where a cell keeps few marks, each keeps its dress; where the crowd was thinned, the decorations went with it. Crowding, not scale, is what takes a topmark away — measured by the budget, which knows whose parts are whose, rather than by the collision grid, which does not.

Nothing else, because fit alone brings back the soup: a cell's budget can keep several marks whose topmarks are all too small to read. Legibility is the condition crowding cannot express.

Decorations of one mark fall independently — a buoy can show a topmark and lose its flare. That is a decision made on cost, not conviction: MapLibre has no cross-layer placement grouping, and true shared fate would mean pre-composing body and topmark into one sprite, undoing the composition scheme that keeps the sheet at ~250 drawings.

**A name is a decoration too.** Identity labels are gated on `topOfCell` — only the mark that leads its cell gets named. Being first in your own cell is the proxy for "there is room here": where the chart is sparse every mark is first and every mark is named; where it is crowded, only one.

## Size is a hierarchy channel, not a global ramp

Size has two inputs, and they do different jobs:

- **The token sets the floor** (`TOKEN` in [`visibility.ts`](../../style/layers/visibility.ts)) — how small the artwork can go and still mean something. A magenta disc goes very small: the enclosing shape and hue are the whole message. A buoy hull goes fairly small on colour and squat silhouette. A lattice mast goes badly, because its meaning is in internal detail. Hue and gross silhouette survive scaling; texture and inner form do not.
- **Prominence sets the ramp** (`sizeRamp`) — bodies hold their token floor through the overview zooms and start growing at z9 (`RAMP_FROM`), reaching full size at the zoom the feature's importance earns. Below the ramp a symbol is a locator: it says what and where, and the reader zooms for the rest.

The rule of thumb: at any given zoom, size should read as prominence. If two symbols are the same size, they should be equally important.

**A body has no vanishing floor.** The token bounds how small a symbol is drawn, never whether it is drawn; only a budget removes a body. Any rule that reads "too small to be worth drawing" is a bug, and so is any rule that swaps a small symbol for a generic one — both throw away the identity the artwork is still carrying.

**Everything shrinks together.** A symbol that holds its pixel size while its neighbours shrink is growing, and the reader sees growth. This binds hardest on figures with spatial extent: nobody reads a buoy's constant size as an area claim, but an arc that appears to grow reads as a claim about how much sea it covers. S-52's millimetre sizes do not transfer here — on paper and fixed-scale ECDIS there is no continuous zoom, so a physical size is unambiguous; on a chart the reader scrolls through, a constant physical size is a moving relationship with everything around it, and the ramp is what keeps the relationship still.

## A figure's extent is a measurement or a convention, and they get opposite treatments

**A measured extent** is the truth about the world: a shoal is as big as it is. When it falls below legibility it is exaggerated to a minimum size rather than dropped — the chart accepts a small lie about size to avoid a large one about presence (S-4 §B-421.1).

**A conventional extent** was never a measurement. A light sector arc says "the red sector lies over there"; its radius means nothing. S-52 fixes it at 20 mm on the display, which is unambiguous on paper and wrong on a zooming chart: an arc encloses sea and is read against the coastline, so a display-fixed figure covers more water on every zoom out — the one figure moving against its neighbours. So sectors are drawn as ground geometry ([`Lights.java`](../../src/main/java/Lights.java), [`sectors.ts`](../../style/layers/sectors.ts)): nominal radii of 0.4 NM for a minor light and 0.7 NM for a major, ×1.25 for the legs and for the smaller of an overlapping pair (S-52's 25:20 proportion outliving its millimetres), inside a zoom window of z10–15. Below the window the arc is a smudge around its own light; past it, it outgrows the screen and reads as an unexplained curve. A measured extent below legibility is exaggerated because presence is the truth being kept; a conventional extent past legibility just bows out, because it never asserted anything its absence could falsify.

A range-true arc stays rejected: it would assert a precision nobody has (nominal range assumes fixed meteorological visibility), a 12 M arc at z14 is hundreds of thousands of pixels with no visible curvature or centre, and the brighter light would always bury the smaller with nothing left to resolve the overlap. "How far does this light reach" is a real question, answered in the characteristic text — and on demand, never through the radius.

Sector geometry joins to its mark on `osm_id` and inherits its budget. Fragments of a ring cut into tiles that hold no trace of their light have no host there and are kept as-is: dropping orphans would amputate every large ring at a tile edge, which is far worse than the rare fragment that outlives a destructively capped host.

## A symbol outranks a label, and behaviour outranks identity

The hierarchy has three levels: the symbol itself, a label that changes what the reader should _do_, and a label that says what the feature is _called_.

- **A label never displaces a symbol.** Bodies hold guaranteed placement, so this holds by construction — stated here so it is not traded away later.
- **A behaviour label outranks an identity label.** A light characteristic, a Racon group, a depth over a hazard all change the decision; a name does not. A lighthouse's name must never take the space a buoy's light description needs. The label layers in [`labels.ts`](../../style/layers/labels.ts) are ordered so that behaviour places first (reverse draw order, again).
- **An identity label is a luxury.** Affordable only where the symbols around it already fit — the `topOfCell` gate, a tighter condition than a mere lower collision priority.

A label must be unambiguously attached to its symbol, and is better dropped than placed ambiguously: two marks close together with free variable anchors can each take a label on the side nearest the _other_ mark, and the pair reads as swapped. Anchor preferences follow the S-4 §B-560.3 order with padding to hold a label against its own mark.

## Aggregate where the group is the fact

At z8 the useful statement about a wind farm is that a wind farm is there, not that it has 83 turbines. S-4 licenses both moves this chart uses: representative selection within a group, outermost members preferred (§B-403.1d), and charting the envelope with a limit and legend where a mosaic is beyond resolving (§B-404, §B-417.6). Grid budgets are the first: independent per-cell allowances spread survivors across a large group, so it reads as a few marks rather than a mat or empty sea. Area envelopes that already exist in the tiles — `production_area`, `marine_farm`, `restricted_area` — carry the group's extent. Cluster marks with counts, or boundary-biased selection, are upgrades to reach for only if evaluation shows those two fail to communicate extent; cluster identity cannot be discovered in per-tile post-processing, so that upgrade means a global or buffered preprocessing stage.

## Where each decision lives

Each decision lives at the cheapest layer that can express it correctly:

| Decision                                                     | Lives in                                                                                       | Costs        |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ------------ |
| Family taxonomy, static rank                                 | [`SeamarkPriority.java`](../../src/main/java/SeamarkPriority.java)                             | planet build |
| `cell_rank` numbering, grid cell size, destructive cap       | [`Seamap.java`](../../src/main/java/Seamap.java)                                               | planet build |
| Class floors, hazard context floors                          | [`SeamarkZoomRules.java`](../../src/main/java/SeamarkZoomRules.java)                           | planet build |
| Sector geometry and radii                                    | [`Lights.java`](../../src/main/java/Lights.java)                                               | planet build |
| Per-family budgets, decoration floors, size tokens and ramps | [`visibility.ts`](../../style/layers/visibility.ts)                                            | page reload  |
| Safety-depth test, isolated-danger test                      | [`hazards.ts`](../../style/layers/hazards.ts)                                                  | page reload  |
| Collision membership (`icon-overlap`, per layer)             | [`structures.ts`](../../style/layers/structures.ts) and friends                                | page reload  |
| Label anchors, order and gates                               | [`placement.ts`](../../style/layers/placement.ts), [`labels.ts`](../../style/layers/labels.ts) | page reload  |

The tile-build numbers are set generously (the cap well above any budget, floors below any style threshold that might move) precisely so the style side can be retuned without touching them.

## Safety guarantees

- A hazard inside any supported safety depth is always in the tiles, and exempt from its budget when it breaches the mariner's setting.
- A body is never removed by size — only by a budget — and never replaced by an abstract stand-in.
- An aid to navigation never disappears from a neighbourhood: budgets thin crowds, and the top of every cell survives.
- A decoration too small to read truthfully is withheld rather than drawn as a smudge that says something false.
- A label is dropped rather than placed where it could read as belonging to a different mark.

## Regression scenes

Each of these has caught a wrong rule; they are the regression set, not a sample. Build test tiles with depth sampling on, or every hazard rule runs in the unknown-depth band and proves nothing.

| Where                                        | Checks                                                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| A German Bight or Horns Rev wind farm, z7–z9 | A group reads as a few marks and its envelope, never a mat and never empty sea                    |
| Copenhagen, z10                              | A harbour front stays legible, and named marinas survive rather than arbitrary basins             |
| `#11.77/54.9708/11.6406`                     | Two cardinals alone in an empty view keep their topmarks — the case a flat decoration zoom fails  |
| `#13.29/54.96405/11.85357`                   | Two marks on the shore whose labels must not read as each other's                                 |
| The Kornati archipelago, z9–z12              | A thousand hazards in one view: thinning at real density, and the shoalest member always retained |
| Any hazard scene, several safety depths      | The safety-depth exemption is evaluated in the style, not baked into rank                         |

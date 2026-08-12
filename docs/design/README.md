# Design guidelines

How this chart decides what to draw and how to draw it. These documents record the posture, the rules, and the departures from the chart standards, each with its reasoning, so a future audit can tell a considered decision from an accident.

- [Visibility](visibility.md) — what draws when: presentation families, density budgets, decorations, size, and labels.
- [Zoom](zoom.md) — the scale framework behind the class floors: navigational purpose bands, SCAMIN, and the minzoom table with its recorded departures.

## Posture

**This is not a type-approved ECDIS presentation.** It is a chart for planning and situational awareness. That freedom is what makes the design work possible, and this document's job is to make sure it is spent on presentation, never on meaning.

This chart draws crowd-sourced OpenStreetMap seamark data in the visual language of paper nautical charts. The IHO standards are the reference: S-4 and INT1 for what the symbols mean and why the conventions exist, S-52 and S-101 for hazard logic and portrayal semantics. The semantic rigor, hazard hierarchy and completeness come from the standards; the presentation aims for modern cartographic craft — restrained color, real typography, purposeful hierarchy, and density that responds to zoom. Where presentation and standard disagree, either the chart is still converging on the standard, or the departure is recorded below with the standards' own reasoning for why it is safe. There is no third case.

## Users

| User                     | Context                                                            | What it demands                                              |
| ------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------ |
| Recreational sailor      | Phone or tablet in an open cockpit; sun glare, spray, arm's length | High contrast, large touch-safe symbols, instant hazard read |
| Passage planner          | Desktop, evening, unhurried                                        | Density, labels, measurement, aesthetic pleasure             |
| Small-craft professional | Chartplotter at the helm, glances between chart and water          | Familiar INT1 semantics, zero relearning cost                |

The glanceability target: the primary hazard read — _am I standing into danger?_ — works in under two seconds at arm's length on a 9″ display in daylight.

## Invariants

Every symbol argument gets settled against these. Ties break toward the invariant.

1. **Navigable vs. non-navigable water is never ambiguous.** Depth tints are ordered, monotonic, and readable at a glance.
2. **A hazard never quietly leaves the chart.** A hazard shallow enough — or unsurveyed enough — to matter at any supported safety depth is always carried in the tiles ([`SeamarkPriority.MAX_SAFETY_DEPTH`](../../src/main/java/SeamarkPriority.java)), and an isolated danger never loses the salience contest to a marina badge.
3. **Semantic shape grammar is preserved wherever semantics are claimed.** A can buoy reads as cylindrical, a nun as conical, cardinal topmarks keep their cone arrangements, a wreck reads as a wreck. Silhouettes and rendering quality evolve; the shape-to-meaning mapping mariners memorized from INT1 does not.
4. **Presence beats completeness.** A mark's base symbol without its topmark communicates more than its complete absence, so at small scales the chart promises class and presence — _a cardinal is here_ — and full semantic identity returns the moment the screen can resolve it. Nothing is ever replaced by an abstract stand-in, because a dot has spent every visual variable it had while a shrunken body still says which class to zoom in on.
5. **Color is never the sole channel for a safety-critical distinction.** Shape, pattern, or label always co-varies.
6. **Attribute-driven symbolization follows the standards' decision logic.** Which features get which class of treatment under which attribute conditions stays governed by the S-52/S-57 semantics. We restyle the outputs, not the decision tree.

## Freedoms

Where the design work lives:

- Every color value.
- Every symbol drawing: stroke weights, level of detail, optical sizing.
- All typography: faces, scale, halos, placement, abbreviation styling.
- Line and area treatments: dash patterns, fill textures, casing, transparency.
- What is visible at rest versus available on demand (tap or hover).
- How much of a symbol draws at each zoom — dressed or bare — and how much density each zoom carries.

## Principles

1. **Muted base, saturated danger.** The seabed, land, and infrastructure recede; hazards and aids to navigation own the saturation budget.
2. **Hierarchy through restraint.** Prominence is spent, not sprayed. If everything is bold, nothing is.
3. **Density scales with zoom.** Progressive disclosure tuned per feature class, so no zoom level is either barren or unreadable.
4. **Drawn as a system.** One stroke grammar, one grid, one corner language across the symbol set.
5. **Typography is symbology.** Soundings, light characteristics, and names are the most-read marks on the chart and get real typographic design.
6. **The pipeline is part of the design surface.** When MapLibre cannot compute it, the pipeline pre-computes it — sector geometry, `cell_rank`, `near_shore`, seabed sampling. The priority order is fixed: safety > beauty > technical constraints. Design the right presentation first, then find the way to render it; only when neither pre-computation nor the style can express a design does the design bend, and then it approximates the intent.
7. **Never trade meaning for beauty.**

## Deliberate departures

Every standards audit asks the same question: where would the standard make this chart worse? The consistent answers, kept on purpose. Anything not listed here is either compliant or a bug.

### Decluttering and scale

- **Symbols shrink at small scale** (S-52 §3.1.5 declutters by hiding, never by scaling). A body shrinks to the floor its artwork can carry rather than vanishing, because a shrunken cardinal still says where to zoom and an empty patch of water says nothing. What makes this safe is that density has its own answer — the per-cell budgets — so shrinking is not the only lever.
- **Class-based SCAMIN is replaced with density-based instance ranking** (`cell_rank`). The S-57 UOC names the weakness itself — class steps "take no direct account of the relative importance of individual occurrences" — and its own optional-rules table ranks instances by hand. The departure automates a fine-tune the standard already describes but cannot compute at compilation time; a tile pipeline can.
- **"An aid to navigation must never disappear" is softened to "must never disappear from a neighbourhood."** A dropped buoy in a field of forty is generalization; the last mark in a cell is a lie.
- **Full semantic recognition is not claimed at every zoom** — invariant 4. Below a decoration's legibility floor a mark shows its body alone; the shape and colour that identify its class still show.
- **Conventional extents are drawn on the ground, inside a zoom window,** instead of at S-52's display-fixed 20 mm. A light sector's radius means nothing, but an arc encloses sea and is read against the coastline, so a display-fixed figure is the one thing on the chart moving against its neighbours on every zoom. Details in [visibility.md](visibility.md).

### Portrayal

- **Composed paper-chart symbology** (body + topmark + reflector + flare as separate layers) over S-52's enumerated simplified set — the paper set is what reads as a chart, and composition keeps ~250 drawings instead of ~12,700.
- **Star symbols for lights** (paper practice) instead of S-52's bare flare or colour circle.
- **A saturated flare palette** — S-52's light colours are calibrated for ECDIS backdrops and read worse here.
- **Green conservation areas** — strictly magenta in S-52, but a chart where bird sanctuaries and military zones share one colour is worse to use.
- **Tiled area patterns and boundary-repeated symbols** instead of single centred symbols, which assume cursor-pick and a fixed scale; tiling is right for a pannable map.
- **Ferry routes in blue-violet** to keep them out of the magenta soup.
- **Background matching the deepest depth band** rather than S-52's no-data grey — the bathymetry is global, so an unloaded tile is a loading flash, and a grey flash is worse UX for no safety gain.
- **Near-black coastline** rather than S-52's grey — paper-black is the better read on a light chart.
- **Safety depth defaults to 2 m**, not IMO's deep-draught defaults — right for this audience, and a setting by design.
- **`icon-overlap: "always"` on marks** — MapLibre silently dropping an aid to navigation is strictly worse than overlap. Density is governed by budgets instead; see [visibility.md](visibility.md).
- **Merged sector-light text and dot-separated light abbreviations** — the paper conventions, which S-101 has since come around to.
- **Grey dashed sector legs** (S-52 says black) — softer legs keep a busy sector light from reading as a hazard boundary, and S-4 §B-475.1 permits it.

### Scope

- **No dusk/night palettes, no shallow-water pattern fills, no safety-contour alarm, no display-category control (base / standard / all-other).** Real ECDIS requirements, out of scope for a daytime web chart today. The density ranking deliberately does not substitute for display categories; when that control ships, its specification-derived category applies independently.

## Evaluation

Ship gates, not vibes:

1. **Glance test:** nearest hazard identified within the target above, checked side-by-side against the previous rendering whenever visibility rules change.
2. **Conspicuity parity:** isolated dangers at least as conspicuous as the S-52 baseline in paired comparisons.
3. **Recognition:** semantic recognition wherever semantics are claimed (invariant 3); class and presence recognition for bodies drawn at their floor (invariant 4). An INT1-trained mariner names a symbol unaided.
4. **CVD redundancy:** safety-critical distinctions survive deutan, protan, and tritan simulation.
5. **Physical size:** minimum legible sizes hold in physical units on a phone at arm's length, not just in CSS pixels.
6. **Töpfer's radical law as a nonbinding diagnostic:** one zoom step out should retain roughly 71% of point symbols, six steps roughly 12%. Investigate large departures; never optimize to the ratio at the expense of a navigation task.

The concrete regression scenes — places that have each caught a wrong rule — live in [visibility.md](visibility.md).

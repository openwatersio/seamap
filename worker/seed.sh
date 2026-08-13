#!/usr/bin/env bash
# Seed the local R2 simulation from a local build so the dev server serves it:
# the versioned archive plus the `latest` pointer naming it. Run after
# `bin/run --area=<area> --force`. The Vite plugin reads the same state dir
# (viewer/vite.config.js points persistState here), and dev serving is
# uncached, so a reseed is live on plain refresh.
set -euo pipefail
cd "$(dirname "$0")"

PMTILES="${PMTILES:-../data/seamarks.pmtiles}"
VERSION="${VERSION:-$(date -u +%Y-%m-%d)}"

[ -f "$PMTILES" ] || { echo "missing $PMTILES — build it first" >&2; exit 1; }
# Ensure wrangler is installed (fresh checkout) — otherwise npx would fetch an
# arbitrary latest wrangler from the registry.
[ -x ../node_modules/.bin/wrangler ] || (cd .. && npm ci)

npx wrangler r2 object put "tiles/seamap/$VERSION.pmtiles" --file "$PMTILES" --local >/dev/null
pointer="$(mktemp)"
printf '%s\n' "$VERSION" > "$pointer"
npx wrangler r2 object put "tiles/seamap/latest" --file "$pointer" --local >/dev/null
rm -f "$pointer"
echo "seeded seamap/$VERSION.pmtiles + latest"

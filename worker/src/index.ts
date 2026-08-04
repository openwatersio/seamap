/**
 * Seamap vector tiles, served from the published PMTiles archive in R2.
 *
 *   GET /seamap/tiles.json         → TileJSON 3.0.0, read from the archive itself
 *   GET /seamap/style.json         → the whole chart style (@openwaters/seamap)
 *   GET /seamap/{z}/{x}/{y}.pbf    → MVT (also .mvt)
 *   GET /seamap/sprites/*          → the chart sprite sheet
 *   GET /seamap/<version>.pmtiles  → the raw archive, range requests included
 *
 * Releases land without a redeploy: bin/publish uploads an immutable
 * seamap/<version>.pmtiles and flips the seamap/latest pointer, which this
 * Worker re-reads once a minute to resolve which archive to serve.
 *
 * Tiles are baked to the archive's maxzoom and served straight through —
 * MapLibre overzooms past it on its own.
 */
import { PMTiles, type Source, type RangeResponse } from "pmtiles";
import { style as chartStyle } from "@openwaters/seamap";
import { CachedSource, contentEtag } from "./cache";
import { mountPath, styleQuery } from "./route";

export interface Env {
  TILES: R2Bucket;
  ASSETS: Fetcher;
  BASE_PATH?: string; // URL mount path = the Cloudflare route prefix; default "/seamap"
  // Local `wrangler dev`: serve uncached and re-read the pointer every request, so
  // a reseed shows up immediately and no validator can 304 a client onto stale bytes.
  DEV?: string;
}

const PREFIX = "seamap/";
// Planetiler writes no attribution into the archive metadata, and the tiles are
// OSM-derived — supply the credit the source has to carry.
const ATTRIBUTION =
  "<a href='https://www.openstreetmap.org/copyright' target='_blank'>© OSM</a>";

class R2Source implements Source {
  constructor(
    private bucket: R2Bucket,
    private key: string,
  ) {}
  getKey() {
    return this.key;
  }
  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    const obj = await this.bucket.get(this.key, { range: { offset, length } });
    if (!obj) throw new Error(`R2 miss: ${this.key}`);
    return { data: await obj.arrayBuffer() };
  }
}

// One PMTiles instance per version, reused across requests within an isolate.
const archives = new Map<string, PMTiles>();
function archive(env: Env, version: string): PMTiles {
  const key = `${PREFIX}${version}.pmtiles`;
  // Dev reseeds replace the archive under the same key, and a cached instance's
  // stale header/directory would read the new bytes at old offsets (garbage /
  // 500s) until wrangler restarts. Published versions are immutable.
  if (env.DEV) return new PMTiles(new R2Source(env.TILES, key));
  let p = archives.get(key);
  if (!p) {
    // Range reads go through the colo cache so directory walks are shared
    // across isolates; the version in the key makes entries self-invalidating.
    p = new PMTiles(
      new CachedSource(
        new R2Source(env.TILES, key),
        `https://tiles.openwaters.io/__pmtiles/${key}`,
      ),
    );
    archives.set(key, p);
  }
  return p;
}

// The pointer bin/publish flips, held briefly per isolate: a weekly release goes
// live within a minute of the upload, at one tiny R2 read per isolate per minute.
const POINTER_TTL = 60_000;
let pointer: { version: string; at: number } | undefined;
async function version(env: Env): Promise<string> {
  if (!env.DEV && pointer && Date.now() - pointer.at < POINTER_TTL)
    return pointer.version;
  const obj = await env.TILES.get(PREFIX + "latest");
  if (!obj) throw new Error(`${PREFIX}latest missing — nothing published yet`);
  const v = (await obj.text()).trim();
  pointer = { version: v, at: Date.now() };
  return v;
}

// chartStyle() fetches the VersaTiles elevation TileJSON, so hold the assembled
// document per param combo rather than paying that round trip per request.
// ponytail: unbounded map — the param space is tiny (a handful of mariner
// defaults); add an LRU if arbitrary combos ever start growing an isolate.
const styles = new Map<string, string>();

const CORS = { "access-control-allow-origin": "*" };
// Stable tile URLs: a release never orphans cached tiles, and
// stale-while-revalidate/-if-error keep serving them (refreshing in the
// background) so a nav app shows stale chart data over a blank tile. s-maxage
// governs the colo cache, whose keys are version-scoped — freshness comes from
// the key, not the TTL. max-age is a day, not an hour: every browser-cache
// expiry fires a conditional request that still bills as an invocation.
const TILE_CACHE =
  "public, max-age=86400, s-maxage=2592000, stale-while-revalidate=31536000, stale-if-error=31536000";
const JSON_CACHE =
  "public, max-age=60, stale-while-revalidate=604800, stale-if-error=31536000";
const MVT = {
  "content-type": "application/x-protobuf",
  "cache-control": TILE_CACHE,
  ...CORS,
};

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // An uncaught throw becomes the runtime's bare 500 with no CORS headers,
    // which browsers report as a CORS block (masking the real status) and
    // MapLibre then won't retry cleanly. Catch everything and answer with CORS.
    return handle(req, env, ctx).catch((e: unknown) => {
      console.log(`unhandled: ${e}`);
      return new Response("internal error", {
        status: 500,
        headers: { "cache-control": "no-store", ...CORS },
      });
    });
  },
};

async function handle(
  req: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  if (req.method !== "GET" && req.method !== "HEAD")
    return new Response("method not allowed", {
      status: 405,
      headers: { allow: "GET, HEAD", ...CORS },
    });
  const url = new URL(req.url);
  const base = (env.BASE_PATH ?? "/seamap").replace(/\/+$/, "");
  const { rel, mount } = mountPath(url.pathname, base);
  const dev = !!env.DEV;
  const inm = req.headers.get("if-none-match");
  // Absolute endpoint base echoed into the TileJSON/style URLs. `wrangler dev`
  // rewrites the request URL *and* Host header to the configured route host,
  // leaving no truthful origin in a local request — so dev pins localhost at
  // the port the dev script binds (package.json).
  const tilesBase = dev
    ? `http://localhost:8788${mount}`
    : `${url.origin}${mount}`;

  // ── Routes that don't depend on the published version ─────────────────────

  // The assets binding stores the sheet at its own paths, which the mount
  // prefix means the request path never matches — rewrite before handing over.
  if (rel === "/sprites" || rel.startsWith("/sprites/")) {
    const res = await env.ASSETS.fetch(
      new URL(rel.slice("/sprites".length) || "/", url.origin),
    );
    const out = new Response(res.body, res);
    out.headers.set("access-control-allow-origin", "*");
    return out;
  }

  // Direct download of a published archive — keeps range-reading pmtiles
  // clients (and the publish workflow's existence check) working.
  if (/^\/[\w.-]+\.pmtiles$/.test(rel)) {
    const key = PREFIX + rel.slice(1);
    // HEAD never touches the body: get() opens the archive's full multi-GB
    // stream only for the runtime to discard it, which stalls the response.
    if (req.method === "HEAD") {
      const head = await env.TILES.head(key);
      if (!head)
        return new Response(null, {
          status: 404,
          headers: { "cache-control": "no-store", ...CORS },
        });
      const headers = new Headers(CORS);
      head.writeHttpMetadata(headers);
      headers.set("etag", head.httpEtag);
      headers.set("accept-ranges", "bytes");
      headers.set("content-length", String(head.size));
      return new Response(null, { headers });
    }
    const obj = await env.TILES.get(key, {
      range: req.headers,
      onlyIf: req.headers,
    });
    if (!obj)
      return new Response("not found", {
        status: 404,
        headers: { "cache-control": "no-store", ...CORS },
      });
    const headers = new Headers(CORS);
    obj.writeHttpMetadata(headers);
    headers.set("etag", obj.httpEtag);
    headers.set("accept-ranges", "bytes");
    // No body means onlyIf didn't match.
    if (!("body" in obj)) return new Response(null, { status: 304, headers });
    const r = obj.range as
      | { offset?: number; length?: number; suffix?: number }
      | undefined;
    if (r && req.headers.has("range")) {
      const off = r.suffix === undefined ? (r.offset ?? 0) : obj.size - r.suffix;
      const len = r.suffix ?? r.length ?? obj.size - off;
      headers.set("content-range", `bytes ${off}-${off + len - 1}/${obj.size}`);
      headers.set("content-length", String(len));
      return new Response(obj.body, { status: 206, headers });
    }
    headers.set("content-length", String(obj.size));
    return new Response(obj.body, { headers });
  }

  // ── Routes served out of the current archive ──────────────────────────────

  const v = await version(env);
  // JSON endpoints validate by version: they derive from the archive, so they
  // SHOULD change every release. Tiles validate by content (below) — most
  // releases leave most tiles byte-identical.
  const etag = `"${v}"`;
  const json = (body: string) =>
    !dev && inm === etag
      ? new Response(null, {
          status: 304,
          headers: { etag, "cache-control": JSON_CACHE, ...CORS },
        })
      : new Response(body, {
          headers: {
            "content-type": "application/json",
            ...(dev
              ? { "cache-control": "no-store" }
              : { "cache-control": JSON_CACHE, etag }),
            ...CORS,
          },
        });

  if (rel === "/tiles.json") {
    const tj = (await archive(env, v).getTileJson(tilesBase)) as Record<
      string,
      unknown
    >;
    // The archive's tile type advertises .mvt; .pbf is what clients expect, and
    // both extensions route here.
    tj.tiles = [`${tilesBase}/{z}/{x}/{y}.pbf`];
    tj.attribution ??= ATTRIBUTION;
    return json(JSON.stringify(tj));
  }

  // Drop-in MapLibre style for these tiles — the same style the viewer renders.
  // Point MapLibre's `style:` (or Maputnik) at this URL directly. ?unit=m|ft|fm,
  // ?safety=<metres>, ?shading=relief|bands, ?language=<code>.
  if (rel === "/style.json") {
    const q = styleQuery(url.searchParams);
    // Uncacheable plain-text 400: an intermediary must never cache an error for
    // a URL that would succeed once the param is fixed.
    if (typeof q === "string")
      return new Response(q, {
        status: 400,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
          ...CORS,
        },
      });
    const key = JSON.stringify([tilesBase, q]);
    let doc = styles.get(key);
    if (!doc) {
      doc = JSON.stringify(
        await chartStyle({
          tiles: `${tilesBase}/tiles.json`,
          spriteBase: `${tilesBase}/sprites`,
          ...q,
        }),
      );
      styles.set(key, doc);
    }
    return json(doc);
  }

  const m = rel.match(/^\/(\d+)\/(\d+)\/(\d+)\.(pbf|mvt)$/);
  if (m) {
    const z = +m[1],
      x = +m[2],
      y = +m[3];
    const noTile = () => new Response(null, { status: 204, headers: CORS });
    // 2 ** z, not 1 << z: shifts are 32-bit signed, so a junk z ≥ 31 in the URL
    // would wrap n and let nonsense addresses through to the archive.
    if (x >= 2 ** z || y >= 2 ** z) return noTile();
    const notModified = (tag: string) =>
      new Response(null, {
        status: 304,
        headers: { etag: tag, "cache-control": TILE_CACHE, ...CORS },
      });
    // Colo cache: repeat tiles never touch R2. The version in the key switches
    // namespaces atomically on a release (no purge); superseded entries LRU out.
    // Same-zone host so a dashboard purge-everything stays an escape hatch.
    const cacheKey = `https://tiles.openwaters.io/__cache/${PREFIX}${v}${rel}`;
    if (!dev && req.method === "GET") {
      const hit = await caches.default.match(cacheKey);
      if (hit) {
        const tag = hit.headers.get("etag");
        return tag && inm === tag ? notModified(tag) : hit;
      }
    }
    const t = await archive(env, v)
      .getZxy(z, x, y)
      .catch((e: unknown) => {
        console.log(`tile ${z}/${x}/${y}: ${e}`);
        return undefined;
      });
    if (!t?.data) return noTile();
    // Content validator, not version: an unchanged tile keeps it across
    // releases, so clients revalidate to bodyless 304s.
    const tag = await contentEtag(t.data);
    if (inm === tag) return notModified(tag);
    const res = new Response(t.data, {
      headers: { ...MVT, etag: tag, ...(dev ? { "cache-control": "no-store" } : {}) },
    });
    if (!dev && req.method === "GET")
      ctx.waitUntil(caches.default.put(cacheKey, res.clone()));
    return res;
  }

  return new Response(
    `usage: ${base}/{z}/{x}/{y}.pbf, ${base}/tiles.json, ${base}/style.json`,
    { status: 404, headers: { "cache-control": "no-store", ...CORS } },
  );
}

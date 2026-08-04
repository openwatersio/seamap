// Request-shape helpers, kept out of index.ts so they stay importable by plain
// Node (route.test.mjs) — index.ts pulls in the style package, which isn't.

export interface Mount {
  /** Path with the mount prefix removed. */
  rel: string;
  /** The prefix that was removed, echoed into the URLs the Worker advertises. */
  mount: string;
}

/**
 * Split the mount prefix off a request path. The Cloudflare route mounts the
 * Worker at BASE_PATH in production; `wrangler dev` serves at the root — so
 * tolerate the prefix being present or absent.
 */
export function mountPath(path: string, base: string): Mount {
  const b = base.replace(/\/+$/, "");
  return b !== "" && (path === b || path.startsWith(b + "/"))
    ? { rel: path.slice(b.length), mount: b }
    : { rel: path, mount: "" };
}

export interface StyleQuery {
  unit?: "m" | "ft" | "fm";
  safety?: number;
  shading?: "relief" | "bands";
  language?: string;
}

/**
 * Mariner defaults for the served style, from the query string. A string result
 * is the message for a 400 — an invalid param is never a silent default.
 */
export function styleQuery(p: URLSearchParams): StyleQuery | string {
  const q: StyleQuery = {};
  const unit = p.get("unit");
  if (unit !== null) {
    if (unit !== "m" && unit !== "ft" && unit !== "fm")
      return "unit must be m, ft, or fm";
    q.unit = unit;
  }
  const safety = p.get("safety");
  if (safety !== null) {
    const n = Number(safety);
    if (safety.trim() === "" || !Number.isFinite(n) || n < 0)
      return "safety must be a non-negative number (metres)";
    q.safety = n;
  }
  const shading = p.get("shading");
  if (shading !== null) {
    if (shading !== "relief" && shading !== "bands")
      return "shading must be relief or bands";
    q.shading = shading;
  }
  // The base map's label language: passed through to @versatiles/style, which
  // falls back to the local name for anything it doesn't carry.
  const language = p.get("language");
  if (language !== null) q.language = language;
  return q;
}

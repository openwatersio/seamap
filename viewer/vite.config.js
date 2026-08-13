import { defineConfig } from "vite";
import { resolve } from "node:path";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { cloudflare } from "@cloudflare/vite-plugin";

// MapLibre loads sprites by URL prefix (it appends .json/.png/@2x itself), so
// the sheet can't ride the hashed asset pipeline — serve it at a stable path.
// node_modules lives at the workspace root, one level up from the vite root.
export default defineConfig(({ command, isPreview }) => ({
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        // Renders the built sheet, so it's only meaningful next to those sprites.
        styleguide: resolve(import.meta.dirname, "styleguide.html"),
      },
    },
  },
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: "../node_modules/@openwaters/seamap/sprites/dist/*",
          dest: "sprites",
          rename: { stripBase: true },
        },
      ],
    }),
    // Dev only: run the tile Worker (in workerd) inside this server, so seeded
    // local tiles are same-origin at /seamap/*. `vite build` stays a plain
    // client build — the Worker deploys separately (worker/).
    ...(command === "serve" && !isPreview
      ? [
          cloudflare({
            configPath: "../worker/wrangler.toml",
            // seed.sh writes the local R2 sim here (wrangler resolves state
            // next to its config file)
            persistState: { path: "../worker/.wrangler/state" },
          }),
        ]
      : []),
  ],
}));

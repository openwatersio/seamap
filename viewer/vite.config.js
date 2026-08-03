import { defineConfig } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'

// MapLibre loads sprites by URL prefix (it appends .json/.png/@2x itself), so
// the sheet can't ride the hashed asset pipeline — serve it at a stable path.
// node_modules lives at the workspace root, one level up from the vite root.
export default defineConfig({
  plugins: [
    viteStaticCopy({
      targets: [{
        src: '../node_modules/@openwaters/seamap/sprites/dist/*',
        dest: 'sprites',
        rename: { stripBase: true },
      }],
    }),
  ],
})

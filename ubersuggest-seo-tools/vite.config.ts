import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// The DS ships unconditional @font-face for Noto Sans JP (9MB) + SC (18MB)
// variable fonts — Vite copies any url() it sees, so they bloat the plugin zip
// to ~28MB even though no glyph renders. Drop the assets and their @font-face
// rules; the font stack already falls back to system-ui (covers CJK on every OS).
// ponytail: bundle the subset CJK fonts if a JP/SC locale ever needs exact glyphs.
function dropCjkFonts(): Plugin {
  return {
    name: 'drop-cjk-fonts',
    generateBundle(_options, bundle) {
      for (const [key, asset] of Object.entries(bundle)) {
        if (asset.type !== 'asset') continue;
        if (/noto-sans-(jp|sc)/i.test(key)) {
          delete bundle[key];
        } else if (key.endsWith('.css') && typeof asset.source === 'string') {
          asset.source = asset.source.replace(
            /@font-face\{[^}]*Noto_Sans_(JP|SC)[^}]*\}/g,
            '',
          );
        }
      }
    },
  };
}

// index.html is the Vite entry = the iframe document. Vite compiles the Tailwind
// CSS (the DS ships *uncompiled* `@import "tailwindcss"` source — decision D4 in
// doc/ARCHITECTURE.md, in the development repository) and emits index.html with
// hashed app.js + .css links injected. The bundle runs inside the iframe realm,
// so radix portals / preflight / :root tokens stay isolated from wp-admin with
// zero per-component code (D5).
// base:'./' keeps those asset links relative so they resolve under /wp-content/.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), dropCjkFonts()],
  resolve: {
    alias: {
      // '@ui' is our adapter over the real @ubersuggest/ui (see src/ui/). App
      // code imports from '@ui'; the adapter imports the real package by its
      // bare name — so '@ubersuggest/ui' must NOT be aliased here, or it loops.
      '@ui': fileURLToPath(new URL('./src/ui/index.tsx', import.meta.url)),
    },
  },
  build: {
    outDir: 'assets/app',
    emptyOutDir: true,
  },
});

# Development

The admin interface is a React application bundled with Vite. Its complete
source ships inside this plugin under `src/`, together with the build
configuration (`package.json`, `pnpm-lock.yaml`, `vite.config.ts`,
`tsconfig.json`, `index.html`), so the bundle in `assets/app/` can be read and
rebuilt rather than taken on trust.

Built with Node.js 22 and pnpm 11:

- `pnpm install` — install dependencies
- `pnpm build` — compile the interface into `assets/app/`
- `pnpm typecheck` — TypeScript, no emit
- `pnpm test` — unit tests

One caveat, stated plainly: `pnpm install` resolves `@ubersuggest/ui` (the
Ubersuggest design system) from a private registry, so a full rebuild currently
needs access to it. Every other dependency is public, and all of this plugin's
own code is in `src/`.

## Translations

The interface itself is translated in `src/i18n/messages/` (nine languages,
loaded by the React app). Two screens sit outside it — the wp-admin dashboard
widget and the audit notice — because they are rendered by PHP, outside the
iframe the app runs in. Their wording lives in `languages/` as eight `.mo`
catalogues.

That folder is a fallback, not a replacement for the community translations at
translate.wordpress.org: WordPress searches `wp-content/languages/plugins/`
first and a plugin's own folder last, so a community translation always wins
over the bundled one. It exists only while every locale there is still at 0%.

Adding or changing a string those two screens render means regenerating:

- `pnpm i18n:pot` — rescan the PHP for translatable strings
- `pnpm i18n:po` — merge the new strings into the eight `.po` files
- `pnpm i18n:mo` — compile the `.mo` files WordPress actually reads

All three run through wp-env, so `pnpm exec wp-env start` has to be up.
`tests/php/unit/TranslationCatalogueTest.php` fails if a string is missing from
the POT, untranslated in any locale, or left uncompiled.

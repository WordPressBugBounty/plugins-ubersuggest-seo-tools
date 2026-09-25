/**
 * Vite's `?raw` suffix, which imports a file as a string instead of a module.
 * Declared here rather than pulling in `vite/client` wholesale, which would drag
 * DOM ambient types the app already gets from `lib`.
 */
declare module '*?raw' {
  const content: string;
  export default content;
}

/** Image imports resolve to the emitted asset's URL. */
declare module '*.webp' {
  const url: string;
  export default url;
}

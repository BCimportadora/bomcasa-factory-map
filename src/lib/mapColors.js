/**
 * Marker colours for the Leaflet maps.
 *
 * Leaflet draws vector markers with real colour values rather than CSS classes,
 * so the few colours the maps need are mirrored here in JavaScript. They must
 * stay in step with the matching custom properties in `src/index.css`:
 * `--c-surface`, `--c-accent` and `--c-ink`.
 *
 * Reading them back out of the DOM with getComputedStyle was the obvious way to
 * avoid the duplication, but the `dark` class that switches the palette is
 * applied in a provider effect, which React runs *after* the effects and render
 * of everything below it — so a map would always read one theme behind.
 */
const PALETTES = {
  light: {
    markerStroke: '#ffffff', // --c-surface
    markerSelected: '#0071e3', // --c-accent
    markerBase: '#171717', // --c-ink
  },
  dark: {
    markerStroke: '#1c1c1f', // --c-surface
    markerSelected: '#0a84ff', // --c-accent
    markerBase: '#f3f3f6', // --c-ink
  },
}

export const mapColors = (resolvedTheme) => PALETTES[resolvedTheme] ?? PALETTES.light

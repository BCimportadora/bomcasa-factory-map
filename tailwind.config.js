/**
 * Colours are declared as CSS variables rather than literal hex values so the
 * whole interface can switch to a dark palette by redefining the variables on
 * `html.dark` — see the token blocks at the top of src/index.css. Without this
 * every `bg-surface` / `text-ink` in the app would need a `dark:` twin.
 *
 * The `<alpha-value>` placeholder is what keeps opacity utilities working, so
 * `bg-surface/90` and `bg-accent/10` still behave.
 */
const token = (name) => `rgb(var(${name}) / <alpha-value>)`

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canvas: token('--c-canvas'),
        surface: token('--c-surface'),
        line: token('--c-line'),
        ink: token('--c-ink'),
        muted: token('--c-muted'),
        accent: {
          DEFAULT: token('--c-accent'),
          /* The hover state for accent buttons: darker in light mode, lighter
             in dark mode, so the name describes its role rather than its hue. */
          dark: token('--c-accent-hover'),
        },
        danger: token('--c-danger'),
        warning: token('--c-warning'),
        success: {
          DEFAULT: token('--c-success'),
          dark: token('--c-success-strong'),
        },
      },
      boxShadow: {
        subtle: 'var(--shadow-subtle)',
        panel: 'var(--shadow-panel)',
        overlay: 'var(--shadow-overlay)',
      },
      maxWidth: {
        content: '78rem',
      },
    },
  },
  plugins: [],
}

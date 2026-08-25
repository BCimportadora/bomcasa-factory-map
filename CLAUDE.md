# Working notes for this project

Setup and feature documentation lives in [README.md](README.md). This file records
the things that are **not** obvious from reading the code — decisions that look
arbitrary until you know why, and traps that have already cost real debugging time.

## Where things live

- Live site: `https://bomcasa-factory-map.vercel.app` (Vercel, deploys on push to `master`)
- Supabase project ref: `dapcuibwcauxbfwjjpbb`
- No test, lint or type-check setup. The only check is `npm run build`.

## Invariants — do not change without re-testing end to end

**`maplibre-gl` is pinned to v5 on purpose.** In v6 the tile-parsing worker is a
separate `.mjs` loaded via `new URL(..., import.meta.url)`. Vite's dependency
pre-bundling rewrites that to a path the dev server never serves, the request
404s, and the basemap renders as an empty background **with no error logged** —
which makes it a slow, silent failure to diagnose. v5 inlines the worker.

**The factory panel collapses via `flex-basis`, not `width`.** From `md` the panel
is a flex item, so its size comes from flex-basis; `width` utilities lose to the
`w-80` the mobile overlay needs, and a flex item's default `min-width: auto` pins
it open at its content width (hence `min-w-0`). The desktop size is set inline in
`FactoriesPage.jsx` because inline styles cannot be outranked by the cascade.
Three Tailwind attempts silently failed here before that.

**The Leaflet ↔ MapLibre bridge never calls `resize()` on the GL map.** It resizes
its own wrapper div and stops there, and MapLibre only re-measures its container
when asked. `AutoResize.jsx` does that explicitly. It also does the work inside a
`requestAnimationFrame` scheduled after the bridge's own, so the wrapper has its
new size first.

**Map controls have fixed corners.** Zoom is pinned top-right (`zoomControl={false}`
plus an explicit `<ZoomControl position="topright" />`); the panel toggle owns
top-left. They overlapped when zoom was left at its default.

**Never pass an inline arrow as an effect dependency into a map layer.**
`BaseTileLayer` did, which tore down and rebuilt the entire GL map on every render
of the surrounding page, including every panel toggle.

**Colours are CSS variables, not Tailwind literals.** `tailwind.config.js` maps
every colour name onto `rgb(var(--c-*) / <alpha-value>)`, with the values in
`:root` and `:root.dark` at the top of `src/index.css`. So `bg-surface` already
works in both themes: adding a `dark:` variant or a literal `bg-white` breaks
night mode silently in one spot. Three things duplicate those values and must be
changed together with them — `src/lib/mapColors.js` (Leaflet takes colour values,
not classes, and reading them back from the DOM gives the *previous* theme,
because the class is applied in a provider effect that runs after its
descendants), `BROWSER_CHROME` in `src/context/ThemeContext.jsx`, and the inline
script in `index.html`.

**That inline script in `index.html` is not optional.** It applies the cached
theme before the bundle parses. Without it every load in night mode starts with
a full-screen flash of white. It also has to agree with `ThemeContext` on the
storage key and on treating anything that is not `'light'` as "follow the system".

**The profile owns the appearance setting; localStorage only caches it.**
`ThemeSync` adopts `profile.theme` on sign-in and writes changes back, and
resets to `'system'` when nobody is signed in so the sign-in screen follows the
device. It sits at the application root, not in `AppLayout`, because the
signed-out half of that rule never renders the layout — and it must ignore the
window where `user` is null only because the session is still resolving, or
every reload throws the preference away.

**The `prefers-color-scheme` listener alone is not enough.** Changing the
appearance means leaving the browser for the system settings, and a hidden tab
has its events throttled, so the change can arrive late or not at all — which
reads as the theme being stuck. `ThemeContext` also re-reads the query on
`visibilitychange` and `focus`. (If the theme still will not follow, check
Chrome's own Appearance setting: with Mode set to Light or Dark rather than
Device, `prefers-color-scheme` never changes and no application code can help.)

**Leaflet's own stylesheet hardcodes light chrome** — white popups, white
controls, white tooltips. `src/index.css` overrides those with `!important` and
the shared tokens, so they follow the theme. The MapLibre *basemap* is separate:
it only goes dark if `VITE_MAPTILER_STYLE_DARK` is set, because a stock dark
style would lose the English labels the custom style exists to provide.

**`delete L.Icon.Default.prototype._getIconUrl` in `FactoryMap.jsx` is load-bearing.**
Leaflet's `Icon.Default` prepends an image path it *guesses* from the
background-image of `.leaflet-default-icon-path` in its own stylesheet. The
bundled urls are already absolute, so the two concatenate into
`/node_modules/leaflet/dist/images//node_modules/...`, which Vite's dev server
answers with the SPA fallback HTML — every pin renders as a broken image.

It reproduces **only in dev**: a production build inlines that background-image
as a data URI, Leaflet's path-guessing regex requires the value to end in
`marker-icon.png`, fails to match, and the prefix comes out empty. So the map
looks fine on Vercel and broken on localhost, which is a confusing place to
start debugging. `mergeOptions` alone does not fix it.

**Road distances default to OSRM's public demo server, and send factory
coordinates to it.** `src/lib/routing.js` reads `VITE_ROUTING_URL` and falls
back to `router.project-osrm.org`, which needs no key but promises no uptime and
asks not to be used for production load. Straight-line distance is deliberately
the default reading in the UI: it is instant, offline and cannot fail, and it
stays on screen while a road lookup is in flight or after one fails. If supplier
locations must not leave the company, set `VITE_ROUTING_URL` to a self-hosted
OSRM — the API is identical.

One `/table` request per point-set covers both readings, so switching between
route and every-pair costs nothing further. Do not "optimise" it into per-pair
`/route` calls: that is n² requests at a free service instead of one.

The `sources[].distance` field in that response is how far each coordinate was
snapped onto the road network, and the panel warns above 1 km. Keep it: OSRM
snaps silently, so without it a distance measured from a road tens of kilometres
away is indistinguishable from a good one. A verified example — the middle of
Qinghai Lake snaps 27 km, a rooftop in Shijiazhuang snaps 47 m.

## Security model

RLS is the security boundary — the browser talks to Postgres directly, so there is
no API layer to enforce anything.

- A `before update` trigger on `profiles` rejects role changes from non-admins.
  Without it any signed-in user could `update profiles set role='admin'` on their
  own row, because RLS legitimately lets them edit that row.
- `auth.uid()` is NULL for service-role and SQL-editor requests. That is how the
  first admin is bootstrapped and how the Edge Functions assign roles.
- Admin operations live in Edge Functions and re-read the caller's role from the
  database via `_shared/adminGuard.ts`. Nothing in the request influences the
  decision. Route guards and hidden menu items are convenience only.
- **Public sign-up is disabled in the Supabase dashboard.** Removing the sign-up
  UI does not achieve this — the anon key is public in the bundle, so the endpoint
  stays reachable. Do not re-enable it.
- The `service_role` key must never appear in a `VITE_` variable. `VITE_*` is
  compiled into the browser bundle.

## Deployment gotchas

- `VITE_*` variables are inlined at **build time**. Changing one in Vercel requires
  a redeploy; the running deployment cannot pick it up.
- Commits must be authored with the email on the GitHub account that owns the repo,
  or Vercel's Hobby plan blocks the deploy as an outside collaborator.
- `supabase/schema.sql` is idempotent — re-run it in full after any schema change
  rather than writing incremental migrations.
- **That file is dollar-quoted (`do $$ … end $$;`), which naive string editing
  eats.** JavaScript's `String.replace()` treats `$$` in the *replacement* as an
  escaped single `$`, so a scripted edit silently emits `do $` and Postgres
  rejects the whole file with "syntax error at or near \"$\"". Use a replacer
  function, or check afterwards that no lone `$` survives and that the `$$`
  count is even.
- Edge Functions need `npx supabase functions deploy` after any change under
  `supabase/functions/`. The "Docker is not running" warning is harmless; Docker is
  only needed to serve functions locally.

## Auth and email

- MapTiler serves raster tiles only for its **stock** styles. The custom
  English-label style is vector-only (raster returns 403), which is the reason
  MapLibre is in the stack at all rather than plain Leaflet raster tiles.
- Password reset depends on Supabase **Site URL** and the redirect allowlist. If a
  redirect is not allowlisted, Supabase silently falls back to Site URL.
- The built-in Supabase mailer allows roughly **2 emails per hour** and often lands
  in spam. A signed-in user should change their password in Settings instead, which
  involves no email. Configure custom SMTP before relying on reset for a team.

## Verifying UI changes

The in-app preview pane does not composite frames, so `requestAnimationFrame`,
`ResizeObserver` and screenshots are unreliable there — a `ResizeObserver` was
measured firing zero times across a real container resize. Layout measurements
(`getBoundingClientRect`) are trustworthy; anything driven by the render loop is
not. **Verify map rendering in a real browser.**

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

**The .xlsx reader is hand-rolled, and the cell regex is the load-bearing part.**
`src/lib/xlsxReader.js` unzips with the browser's own `DecompressionStream`
rather than pulling in a spreadsheet library. Cells are matched as *whole*
`<c>…</c>` or `<c …/>` elements, never with a lazy `.*?` up to the first `/>`:
a shared formula is written `<f t="shared" si="0"/>`, and a lazy match stops
there and returns nothing. That failure is invisible in the worst way — the
first rows of a sheet read perfectly and every later row comes back blank,
because Excel writes the formula out once and has the rest reference it. It
cost a debugging round here; the totals row is what gave it away.

**Liquidation columns are found by heading text, not position.** These sheets
are maintained by hand and gain a column sooner or later. Matching on position
means the import silently reads duty as freight instead of failing. Headings
are normalised (accents, line breaks, double spaces) and the map in
`src/lib/liquidation.js` lists more specific headings first — "costo total imp
pagos" must be tried before "costo total". It also deliberately accepts the
sheet's typo "TRERRESTE" alongside the correct spelling; do not "fix" that.

**Landed-cost headline figures are columns, the rest is jsonb.** Twenty-odd
charge components differ between shipments and will gain new ones, so
`order_items.cost_breakdown` holds them and only the figures that get read,
sorted or totalled are real columns. A sheet growing a column needs no
migration.

**A price of zero is not a price; a charge of zero is.** The sheets carry 0
against items never sold (a spare driver marked USO INTERNO), so `OrderDetail`
renders prices of 0 as an em dash while leaving breakdown charges of 0 as
"0.00" — no duty charged is a real fact. The stored values keep the zero either
way.

**Never leave a customer spreadsheet in `public/`.** Verifying the parser means
serving a real workbook to the dev server, and `public/` is copied verbatim into
`dist/` and deployed. Delete it the moment the check passes, and confirm with
`find . -name '*.xlsx' -not -path './node_modules/*'` before committing.

**Orders are one table with two views, not two features.** `orders` +
`order_items`, and a single status flow (`draft → confirmed → in_production →
ready → shipped → arrived`, plus `cancelled`). "Orders to do" shows the first
three, "ready & in transit" the next three, and an order that ships changes
status rather than being re-typed. Both tiles render `OrdersPage` with a
different `view` prop; the split itself lives in `ORDER_VIEWS` in
`src/lib/orders.js`. A cancelled order is reachable from the to-do filter only —
in neither list it would be lost, in both it would clutter the shipping board.

**Every section is built, so the placeholder path is now dead code that should
stay.** `SECTIONS.filter((s) => !s.ready)` in `App.jsx` currently yields nothing
and `SectionPlaceholder` never renders. Both are the mechanism for the next
section rather than leftovers — deleting them means rebuilding them.

**Suggestions reuse the R&D label colours deliberately.** `STATUS_TONES` in
`src/lib/suggestions.js` points at `status-idea`, `status-todo` and friends
rather than defining its own. A second palette would mean five more light/dark
contrast pairs to keep honest for no gain — a status board is a status board.

**Innovation images live in a PRIVATE storage bucket.** A public bucket serves
every object to anyone who has or guesses the URL, with no sign-in at all, and
these are unreleased product designs. So there is no permanent URL to store:
`useSignedImages` signs each path for the person looking at it, one hour at a
time. If images ever go blank, check the bucket is still `public = false` and
that the `storage.objects` policies survived — re-running `schema.sql` restores
both.

**That hook batches on purpose.** Every card mounts its own `InnovationImage`,
so a board of forty items would issue forty signing requests in the same tick.
A module-level queue collects the paths and signs them in one call at the end of
the tick, keyed by path so duplicates collapse too. Do not "simplify" it back
into a per-component request.

**There are two private buckets, and widening one to replace the other is the
wrong fix.** `innovations` is images only at 10MB and holds unreleased product
designs; `order-files` is 25MB and holds customs paperwork. They have separate
`storage.objects` policies for a reason — one set of rules over both means a
mistake in either exposes the other. Both are `public = false`.

**Order file uploads send a content type derived from the file extension, never
`file.type`.** The bucket enforces its `allowed_mime_types` against whatever
content type the upload carries, and `application/octet-stream` is deliberately
not on the list. Windows reports `.xlsx` as `application/octet-stream` when
Excel is not installed, and `.csv` arrives as `text/plain`,
`application/vnd.ms-excel` or `''` depending on the machine — so trusting the
browser makes uploads fail on some people's laptops and succeed on others,
which is the worst kind of bug to be told about second-hand.
`MIME_BY_EXTENSION` in `src/lib/orderFiles.js` is the map. This is metadata
only; the stored bytes are untouched either way, which matters because these
documents feed the catalog importer and must come back exactly as the customs
agent or supplier sent them.

**`useFactories` and `useOrders` name their realtime channel with a fixed
string.** So two live instances of either hook collide on one Supabase channel
and throw `cannot add postgres_changes callbacks ... after subscribe()`. That
never happens in the application, because the pages that use them are separate
routes — but it does happen the moment anything renders two at once, and the
error names the channel rather than the mount, so it reads like a Supabase
fault. `useOrderFiles` avoids it by putting the order id in the channel name;
keep that if a second file list is ever mounted beside the first.

**Promotion to the ready-to-order section is enforced in the database.**
`enforce_innovation_update_rules` rejects a `stage` change from a non-admin, and
rejects a move to `ready` unless the label is `done`. The button in the detail
modal is a convenience; the trigger is the control, because the anon key is
public and PostgREST would otherwise take the PATCH straight from the browser.
`label` and `stage` are deliberately separate columns — collapsing them would
make relabelling an item promote it by accident.

**Variations are upserted, never recreated.** Quotes reference variation ids, so
the delete-and-reinsert pattern used for order lines would cascade every quote
away. A variation added in the open form has no id yet, so the editor tags its
quotes with a temporary `key` and `saveDetails` translates those to real ids
after the variations come back — joined on `line_no`, since the order rows are
returned in is not guaranteed.

**The print sheet is the one screen that ignores the theme.** `/innovations/print`
hard-codes black on white and skips `AppLayout` entirely, and `@media print` in
`index.css` forces `background: #fff` past the dark tokens. Printing a night-mode
page either wastes a cartridge on a black rectangle or, with backgrounds off,
prints pale grey text on white. This is a deliberate exception to the
colours-are-tokens rule below, not an oversight.

**Making a section real takes two edits, not one.** Flip `ready` in
`src/lib/sections.js` *and* add an explicit route in `App.jsx`. The generated
routes only cover `ready: false` sections, so flipping the flag alone leaves the
tile pointing at a route that no longer exists.

**Saving order lines inserts before deleting, on purpose.** `replaceItems` in
`useOrders.js` writes the new rows, then removes the old ones by id. The two
steps are not one transaction: in this order a failure leaves visible duplicate
lines, which someone can fix. The other order would silently empty the order.

**`order_items.line_no` is not decoration.** PostgREST makes no promise about
row order, so without it the lines of an order can come back shuffled between
two reads of an unchanged record. The hook sorts on it after every fetch.

**Status badge colours are tokens because one shade cannot serve both themes.**
`--c-status-*` in `src/index.css`, light and dark values measured against
`--c-surface` in each theme; all seven clear WCAG AA for 12px text, worst case
4.70:1. The obvious `bg-amber-500/10 text-amber-600` style used by the menu tiles
does not survive the check — `text-amber-600` measures 3.19:1 on a white card and
`text-teal-700` 3.11:1 on a dark one. If you re-measure these, note that probing
a Tailwind class Tailwind never compiled returns the *inherited* colour, not the
one you asked for, which reads as a suspiciously perfect result.

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

**Never pass `icon={undefined}` to a react-leaflet `<Marker>`.** react-leaflet
hands its props straight to `new L.Marker(position, options)`, and Leaflet's
`setOptions` copies *every* key it is given, undefined values included. So an
undefined icon does not fall back to Leaflet's default — it shadows it, and the
marker throws `Cannot read properties of undefined (reading 'createIcon')` the
moment it is added. That took down the whole Factories page, and because the
follow-on unmount errors say `_leaflet_events` instead, the message you see
names the wrong thing. `FACTORY_ICON` exists purely so both branches of the
office/warehouse ternary hand over a real icon.

**Sections are wrapped in an ErrorBoundary for this reason.** A throw anywhere
used to unmount the app and leave a white page, indistinguishable from a network
failure or a bad deploy. It sits inside `AppLayout` so the sidebar survives, and
is keyed on the path so navigating away clears it.

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

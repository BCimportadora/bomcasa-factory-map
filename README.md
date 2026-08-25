# Bomcasa Platform

An internal business platform for supplier and logistics management in China:
a factory map, a China FOB port reference, a people directory, administrator
account management, and a full English/Spanish interface.

## Tech stack

- **Frontend**: React 18 + Vite + Tailwind CSS (JSX)
- **Routing**: React Router v6
- **Maps**: Leaflet + react-leaflet, with a MapTiler vector basemap rendered by MapLibre GL (English labels), falling back to CARTO raster tiles
- **Backend**: Supabase — Postgres, Auth, row-level security, and one Edge Function
- **Hosting**: Vercel (config also included for Netlify)

There is no separate API server. The browser talks to Supabase directly, so
**row-level security in Postgres is the security boundary**, with one Edge
Function for the operation that needs elevated privileges.

---

## ⚠️ Required setup

The application will not work correctly until **both** of these are done.

### 1. Apply the database schema

Open the Supabase SQL editor and run [`supabase/schema.sql`](supabase/schema.sql)
in full. It is idempotent — safe to run on a fresh project or an existing one.

It adds `first_name`, `last_name`, `department`, `language` and `updated_at` to
`profiles`, replaces the RLS policies, and installs the privilege-escalation
guard. Until it runs, the People and Administration pages will report a load
error, because those columns do not exist yet.

Then promote your own account to administrator:

```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```

This works from the SQL editor because the escalation guard only applies to
requests made by a signed-in user.

### 2. Turn off public sign-up  ← security critical

In the Supabase dashboard: **Authentication → Sign In / Providers → Email**, and
disable **"Allow new users to sign up"**.

This is not optional and cannot be fixed in the frontend. The anon key is public
in the deployed JavaScript, so while this setting is on, anyone can create an
account by calling the sign-up endpoint directly, regardless of the fact that the
app no longer has a sign-up screen. At the time of writing, this project reported
`disable_signup: false` — meaning sign-up was open.

### 3. Deploy the account-creation function

Administrator account creation runs server-side, because creating a user
requires the `service_role` key, which must never reach the browser.

```bash
supabase functions deploy admin-create-user
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by Supabase
automatically; no extra secrets to configure. Until the function is deployed,
the Administration page explains that account creation is unavailable rather
than failing silently — everything else keeps working.

---

## Environment variables

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_MAPTILER_KEY=your-maptiler-key          # optional, enables English map labels
VITE_MAPTILER_STYLE=your-english-style-id    # optional, see "Map labels" below
VITE_MAPTILER_STYLE_DARK=your-dark-style-id  # optional, dark basemap for night mode
VITE_ROUTING_URL=https://your-osrm-host       # optional, see "Measuring distance"
VITE_ROUTING_PROFILE=driving                  # optional, OSRM profile name
```

`VITE_*` variables are compiled into the browser bundle at **build time**, so
after changing them in Vercel you must redeploy. They are all public values;
the `service_role` key must never be added here.

## Running locally

```bash
npm install
```
```bash
npm run dev
```

Available commands: `npm run dev`, `npm run build`, `npm run preview`. The
project has no test, lint or type-check setup.

---

## Roles and permissions

| | Administrator | Business User |
|---|---|---|
| Sign in | ✅ | ✅ |
| People directory | ✅ | ✅ |
| FOB Ports | ✅ | ✅ |
| Factories | view all, edit all | view all, edit only their own |
| Create accounts | ✅ | ❌ |
| Assign roles / departments | ✅ | ❌ |
| Change own role | ❌ (only via SQL) | ❌ |

Enforcement happens at three independent layers:

1. **Navigation** — administrator entries are hidden from business users.
2. **Routes** — `ProtectedRoute` blocks `/admin/*` for non-admins.
3. **Database and Edge Function** — the real boundary.

Layers 1 and 2 are convenience only. Everything they hide is independently
enforced server-side, so editing frontend state, localStorage or the URL, or
calling the API directly, gains nothing.

### How privilege escalation is prevented

A business user legitimately needs to update their own profile row, so RLS must
permit it. Without a further guard they could simply run:

```
update profiles set role = 'admin' where id = <their own id>
```

A `before update` trigger (`enforce_profile_update_rules`) rejects any change to
`role` unless the caller is already an administrator, and also pins `email` and
`created_at`. `auth.uid()` is NULL for service-role and SQL-editor requests,
which is how the first administrator is bootstrapped and how the Edge Function
assigns roles.

The Edge Function re-reads the caller's role from the database rather than
trusting anything in the request, and returns 401/403 before touching any data.

---

## Features

### Appearance (night mode)
Light, Dark, or System — chosen in Settings (`/account`) and saved to the
person's profile, so it travels with them to any device. "System" follows the
operating system's appearance setting and reacts live when it changes, including
when the change was made while the browser was in the background.

Signed out, the interface always follows the device: the sign-in screen belongs
to nobody in particular, so it should not still be wearing the colours of
whoever used the browser last. [`ThemeSync`](src/components/Layout/ThemeSync.jsx)
holds both halves of that rule.

`localStorage.bomcasa.theme` is a cache, not the source of truth. It exists so
the inline script in `index.html` can paint the right colours before the bundle
has parsed; the profile decides. Like language, this is a display preference and
has no bearing on role, permissions or access.

The palette is one block of CSS variables in
[`src/index.css`](src/index.css) redefined under `:root.dark` — see "Colour
tokens" below. An inline script in `index.html` applies the stored choice before
the bundle loads, so night mode does not begin with a flash of white.

The basemap follows the theme where it can: the CARTO fallback has a dark
counterpart built in, and MapTiler switches to `VITE_MAPTILER_STYLE_DARK` if you
set one. Without that variable the light basemap is kept in night mode — see
"Map labels".

### Main menu (`/`)
The first screen after signing in. Every section of the platform is shown as a
tile — including the ones still being built, which are marked "Coming soon" and
open a placeholder rather than a broken page.

Sections are declared once in [`src/lib/sections.js`](src/lib/sections.js); the
menu and the sidebar both render from that list, and routes for unbuilt sections
are generated from it, so adding a section means editing one file plus the two
translation bundles.

### Factories (`/factories`)
The factory map: click the map to add a factory, edit and delete, search and
filter by name/city/province/product, and CSV import/export. Everyone can see
every factory; business users can only edit and delete the ones they created,
while admins can edit any.

**Measuring distance.** The ruler button on the map starts a measurement: click
places in turn to build a path of any length, and each leg and the running total
appear in a panel at the bottom left. Undo drops the last stop; Clear starts
over.

The eight FOB ports appear alongside the factories while measuring — and only
while measuring, since this is the factory map — so a path can mix the two:
factory → port → factory answers "which port should this supplier ship from",
which is the question the feature exists for. The same measurement is available
on the FOB Ports page for port-to-port distances.

**Route or every pair.** By default the stops are read as a route — consecutive
legs plus a total. Holding **Ctrl** (or ⌘) while selecting switches to *every
pair*, which measures each stop against every other and sorts them nearest
first. With a factory, a port and a second factory, the route shows only
factory→port and port→factory; every pair adds the distance between the two
factories as well. There is a toggle in the panel too, since a modifier key is
no use on a touchscreen.

No total is shown in pair mode: summing every pair produces a number that means
nothing.

**Straight line or by road.** The second toggle switches between the great-circle
distance and the actual driving distance and time, from an OSRM-compatible
routing service ([`src/lib/routing.js`](src/lib/routing.js)). Both readings work
in either mode, so "road distance between every pair" is available too — one
`/table` request returns the whole matrix, and consecutive legs are simply some
of its cells. The matrix is asymmetric on purpose: with one-way streets, A→B and
B→A are genuinely different roads.

Straight line stays the default, because it is instant, needs no network, and
cannot fail. Road distances are a network call, so while one is in flight — or
if it fails — the straight-line figures stay on screen with a note saying so,
rather than the panel emptying out.

Two things to know before relying on it:

- **The default is OSRM's public *demo* server.** It needs no account and covers
  China from OpenStreetMap data, but it makes no uptime promise and asks not to
  be used for production load. Set `VITE_ROUTING_URL` to a self-hosted or
  commercial OSRM instance before depending on it; the API is identical, so no
  code changes.
- **Factory coordinates are sent to that server.** Your supplier locations are
  business-sensitive, and this is the one feature in the app that shares them
  with a third party. Self-hosting avoids that entirely.

Road data in China is less complete in OpenStreetMap than in Europe, and the
demo server routes a car rather than a lorry, so treat the figures as good
approximations rather than dispatch-grade planning.

The figure is the great-circle distance from
[`src/lib/distance.js`](src/lib/distance.js) — straight line, not road or sea
route, which the panel states plainly. There is no routing provider in the
stack, and quietly presenting a straight line as a driving distance would be
worse than not offering the feature. Haversine rather than a flat-earth
approximation, because suppliers are routinely more than a thousand kilometres
apart, where the shortcut drifts by kilometres.

While measuring, clicking empty map does *not* create a factory and clicking a
marker does not open its details — the click means "add this stop". The numbered
badges ignore pointer events so the same place can be selected again, which is
what measuring a return trip needs.

The mechanics are shared by both maps: [`useMeasure`](src/hooks/useMeasure.js)
holds the state and turns a factory or a port into a measurable point, and
`MeasureButton`, `MeasureLayer` and `MeasurePanel` under
[`src/components/Map/`](src/components/Map) draw it. Point keys are namespaced
(`factory:…`, `port:…`) because the two id spaces are only accidentally
distinct.

### People (`/people`)
Directory of everyone with access, showing name, department and role. Searchable
and filterable. Only non-sensitive columns are selected — email is not requested
for the ordinary directory view.

### FOB Ports (`/ports`)
The eight major Chinese export ports used for FOB shipping: Shanghai,
Ningbo-Zhoushan, Shenzhen, Guangzhou, Qingdao, Tianjin, Xiamen and Hong Kong.
Selecting a port shows its city, province, main terminals, UN/LOCODE,
coordinates and a short factual description. The ruler button measures between
ports; the details panel steps aside while a measurement is open, since the two
compete for the same corner of the screen.

Coordinates in [`src/lib/ports.js`](src/lib/ports.js) point at the container
port area rather than the city centre, and were checked against geocoding for
the relevant port district (Yangshan, Beilun, Yantian, Nansha, Qianwan, Xingang,
Haicang, Kwai Chung). No business-specific logistics data is invented.

### Administration → Manage accounts (`/admin/accounts`)
Administrators only. Lists all accounts and creates new ones with email, first
name, last name, department and role. The new user receives a generated
temporary password, shown once, to be shared over a secure channel and changed
after first sign-in.

### Profile setup
On first sign-in, a user without a completed profile is routed to `/setup` to
provide first name, last name and department. Email comes from the
authenticated session and is read-only; **role is displayed but not editable** —
the database rejects role changes from non-admins regardless of what the client
sends.

---

## Internationalisation

English (default) and Spanish, implemented in [`src/i18n/`](src/i18n) with no
extra dependency:

- `en.js` / `es.js` — translations grouped by area (`common`, `nav`, `auth`, `profile`, `departments`, `roles`, `people`, `ports`, `factories`, `csv`, `admin`, `errors`)
- `index.jsx` — provider exposing `t(key, values)` and `tCount(baseKey, n)`

Components never branch on the current language; they call `t()`. Missing keys
fall back to English and warn in development.

The switcher is **text only** ("English | Español") and appears on the sign-in
screen, the profile setup screen and in the sidebar. Changing it on the sign-in
screen updates that screen immediately and the choice carries through sign-in.

Preference is stored in `localStorage` and, once signed in, mirrored to
`profiles.language` so it follows the user across devices. Language is a display
preference only and never affects role, permissions or access.

---

## Colour tokens

Every colour in the interface resolves through a CSS variable. `tailwind.config.js`
declares each colour as `rgb(var(--c-name) / <alpha-value>)`, and the values live
in two blocks at the top of [`src/index.css`](src/index.css): `:root` for light
and `:root.dark` for night mode. Tailwind runs in `darkMode: 'class'`, and the
class is set on `<html>`.

The practical consequence: **write `bg-surface`, never `bg-white` and never a
`dark:` variant.** Both themes then come out of the same class, and the opacity
utilities (`bg-surface/90`, `bg-accent/10`) keep working because of the
`<alpha-value>` placeholder.

Three tokens carry a deliberate wrinkle:

- `accent-dark` is the *hover* colour for accent buttons. It gets darker in light
  mode and lighter in night mode, which is why the variable behind it is called
  `--c-accent-hover`.
- `--c-danger` has to stay legible as text, which pulls it light in night mode
  and leaves it too pale to sit under the white label of a destructive button.
  `.btn-danger` therefore uses `--c-danger-strong`.
- `--scrim` is not derived from `--c-ink`: ink inverts to near-white, and a pale
  backdrop lightens exactly what it is supposed to push back.

Leaflet draws vector markers with real colour values rather than classes, so
[`src/lib/mapColors.js`](src/lib/mapColors.js) mirrors three of the tokens in
JavaScript. Change one of those tokens and you must change both files.

---

## Map labels (English street names)

The basemap is chosen in [`src/components/Map/BaseTileLayer.jsx`](src/components/Map/BaseTileLayer.jsx):

- **With `VITE_MAPTILER_KEY` and `VITE_MAPTILER_STYLE`** — MapTiler vector tiles rendered by MapLibre GL. OpenStreetMap's `name:en` tags give English street names in Chinese cities (~94% coverage in central Shanghai).
- **Without them** — CARTO Positron raster tiles: no account needed, but street names appear in Chinese. In night mode this becomes CARTO Dark Matter.

In night mode MapTiler uses `VITE_MAPTILER_STYLE_DARK` when it is set, and
otherwise keeps the light style. That is deliberate: the custom style is the
only thing supplying English labels, and falling back to a stock dark style
would put Chinese street names back on the map. To get a dark basemap *and*
English labels, duplicate your style in MapTiler, switch it to a dark base, and
put its id in `VITE_MAPTILER_STYLE_DARK`.

MapTiler serves raster tiles only for its own stock styles; a *custom* style —
which is what carries the English label setting — is vector-only, which is why
MapLibre is involved. MapLibre is loaded with a dynamic `import()` so its ~1 MB
stays out of the initial bundle.

`maplibre-gl` is pinned to **v5** deliberately. In v6 the tile-parsing worker is
a separate `.mjs` loaded through `new URL(..., import.meta.url)`; Vite's
pre-bundling rewrites that to a path the dev server does not serve, the request
404s, and the map renders as an empty background **with no error logged**. v5
inlines the worker. Do not upgrade without re-testing the map end to end.

---

## Project structure

```
src/
  components/
    Admin/CreateAccountForm.jsx    admin-only account creation form
    Auth/ProtectedRoute.jsx        auth + profile + admin route guard
    Csv/CsvImportExport.jsx        factory CSV import/export
    Factory/                       factory form, list, search & filter
    Layout/AppLayout.jsx           sidebar shell + mobile drawer
    Layout/LanguageSwitcher.jsx    text-only EN/ES selector
    Layout/ThemeSwitcher.jsx       light / dark / system selector (Settings only)
    Layout/LanguageSync.jsx        mirrors language choice to the profile
    Layout/ThemeSync.jsx           mirrors appearance to the profile; device when signed out
    Map/BaseTileLayer.jsx          basemap selection + fallback
    Map/FactoryMap.jsx             factory markers, plus ports while measuring
    Map/PortMap.jsx                FOB port map
    Map/PortMarker.jsx             a port, drawn the same on either map
    Map/Measure{Button,Layer,Panel}.jsx  distance measurement UI
    common/Modal.jsx, FullScreenMessage.jsx
  context/AuthContext.jsx          session, profile, role, profile updates
  hooks/useFactories.js            factory CRUD + realtime
  hooks/useProfiles.js             directory reads
  hooks/useMeasure.js              measurement state, shared by both maps
  i18n/                            en.js, es.js, provider
  context/ThemeContext.jsx         holds and applies light / dark / system
  lib/constants.js                 departments, roles, themes, profile helpers
  lib/mapColors.js                 marker colours Leaflet needs as literal values
  lib/distance.js                  great-circle distance and formatting
  lib/routing.js                   road distances and driving times (OSRM)
  lib/sections.js                  the app's sections — menu, sidebar and routes
  lib/ports.js                     FOB port dataset
  lib/csv.js, supabaseClient.js
  pages/HomePage.jsx               the main menu
  pages/SectionPlaceholder.jsx     stand-in for sections not built yet
  pages/                           Login, ProfileSetup, Factories, People, Ports, AdminAccounts
supabase/
  schema.sql                       tables, RLS, triggers (idempotent)
  functions/admin-create-user/     server-side account creation
```

## Deployment

Push to `master`; Vercel builds and deploys automatically. Environment variables
live in **Settings → Environment Variables** and require a redeploy to take
effect, because Vite inlines them at build time.

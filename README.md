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
Light, Dark, or System — chosen from the sidebar or Settings, and stored per
device in `localStorage` under `bomcasa.theme`. "System" follows the operating
system's appearance setting and reacts live when it changes. Like language, this
is a display preference and has no bearing on role, permissions or access.

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

### People (`/people`)
Directory of everyone with access, showing name, department and role. Searchable
and filterable. Only non-sensitive columns are selected — email is not requested
for the ordinary directory view.

### FOB Ports (`/ports`)
The eight major Chinese export ports used for FOB shipping: Shanghai,
Ningbo-Zhoushan, Shenzhen, Guangzhou, Qingdao, Tianjin, Xiamen and Hong Kong.
Selecting a port shows its city, province, main terminals, UN/LOCODE,
coordinates and a short factual description.

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
    Layout/ThemeSwitcher.jsx       light / dark / system selector
    Layout/LanguageSync.jsx        mirrors language choice to the profile
    Map/BaseTileLayer.jsx          basemap selection + fallback
    Map/FactoryMap.jsx             factory markers
    Map/PortMap.jsx                FOB port markers
    common/Modal.jsx, FullScreenMessage.jsx
  context/AuthContext.jsx          session, profile, role, profile updates
  hooks/useFactories.js            factory CRUD + realtime
  hooks/useProfiles.js             directory reads
  i18n/                            en.js, es.js, provider
  context/ThemeContext.jsx         light / dark / system, persisted per device
  lib/constants.js                 departments, roles, themes, profile helpers
  lib/mapColors.js                 marker colours Leaflet needs as literal values
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

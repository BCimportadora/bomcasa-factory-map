# Bomcasa Factory Map

A web app for managing and visualizing factory locations across China: an interactive map, a searchable/filterable directory, role-based access control, and CSV import/export.

## Tech stack

- **Frontend**: React 18 + Vite + Tailwind CSS
- **Map**: Leaflet + Esri World Street Map tiles (no API key required, WGS-84 coordinates, labels rendered in English)
- **Backend/database**: Supabase (Postgres + Auth + Row Level Security)
- **Deployment**: Vercel or Netlify (config included for both)

## Project structure

```
src/
  components/
    Auth/ProtectedRoute.jsx      redirects unauthenticated users to /login
    Csv/CsvImportExport.jsx      import/export buttons + CSV parsing feedback
    Factory/FactoryForm.jsx      create/edit form (validates lat/lng)
    Factory/FactoryList.jsx      sidebar list of factories
    Factory/SearchFilter.jsx     search box + province dropdown
    Layout/Navbar.jsx            top bar with user email, role badge, sign out
    Map/FactoryMap.jsx           Leaflet map, markers, click-to-add handler
    common/Modal.jsx             generic modal used for the factory form
  context/AuthContext.jsx        Supabase auth session + profile (role) state
  hooks/useFactories.js          fetch/create/update/delete + realtime subscription
  lib/csv.js                     CSV export/import helpers (PapaParse)
  lib/supabaseClient.js          Supabase client, reads env vars
  pages/LoginPage.jsx, SignupPage.jsx, MapPage.jsx
supabase/schema.sql              tables, triggers, RLS policies
```

## Prerequisites

- Node.js 18+
- A free [Supabase](https://supabase.com) project

## 1. Database setup

1. Create a new Supabase project.
2. Open the SQL editor and run the contents of [`supabase/schema.sql`](supabase/schema.sql). This creates:
   - `profiles` — one row per user, with a `role` of `admin` or `business_user` (defaults to `business_user`, auto-created on signup via trigger).
   - `factories` — the factory records, with a `created_by` column and `latitude`/`longitude` `check` constraints.
   - Row Level Security policies so that `business_user` accounts only see/edit/delete rows they created, while `admin` accounts see/edit/delete everything.
3. Promote your own account to admin after signing up once in the app:
   ```sql
   update public.profiles set role = 'admin' where email = 'you@example.com';
   ```
   New accounts cannot self-promote — this is intentional and must be done via the SQL editor (or the Supabase dashboard) by someone with database access.
4. In Supabase → Project Settings → API, copy the **Project URL** and **anon public key**.

## 2. App setup

```bash
npm install
cp .env.example .env
```

Fill in `.env`:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Run locally:

```bash
npm run dev
```

Sign up in the app, then (optionally) promote yourself to admin using the SQL command above.

## CSV import/export

Export writes the currently filtered list to `factories.csv`. Import expects a header row with these columns (see [`sample-factories.csv`](sample-factories.csv) for an example):

```
name,address,city,province,latitude,longitude,contact_person,phone,products,capacity,notes
```

- `name`, `latitude`, `longitude` are required; rows missing them or with a non-numeric coordinate are skipped and reported.
- Imported rows are created under the signed-in user's account (`created_by`), so RLS still applies — a `business_user` importing a CSV only ever creates rows they themselves own.

## China map coordinates

This app uses **Leaflet** with raster tiles, so factory coordinates are stored and displayed as standard **WGS-84** latitude/longitude — no conversion needed.

If you later switch to **AMap (Gaode)** or **Baidu Maps**, note that both use the **GCJ-02** ("Mars Coordinate System") offset used within mainland China, not raw WGS-84 — you'd need to convert coordinates (WGS-84 → GCJ-02) before plotting them, and back again if re-exporting. `VITE_AMAP_KEY` is reserved in `.env.example` for that swap; the current codebase doesn't use it since it renders with Leaflet.

Never use Google Maps for this project — it isn't reliably available inside mainland China.

## Map labels (English street names)

The basemap is selected in [`src/components/Map/BaseTileLayer.jsx`](src/components/Map/BaseTileLayer.jsx):

- **With `VITE_MAPTILER_KEY` set** — MapTiler tiles are used. MapTiler can render OpenStreetMap's `name:en` tags, and coverage in Chinese cities is good (~94% of named roads in central Shanghai carry an English name), so streets appear as "Century Avenue", "Middle Jinling Road", etc.
- **Without a key** — falls back to **CARTO Positron**, which needs no account but labels streets in Chinese.

To enable English labels:

1. Create a free account at [maptiler.com](https://www.maptiler.com) and copy your API key.
2. In MapTiler Cloud, open a style (e.g. Streets), choose **Customize**, set the label **Language** to English, and publish it. Copy the resulting style id.
3. Set both variables — locally in `.env`, and in your Vercel/Netlify project settings for production:
   ```
   VITE_MAPTILER_KEY=your-key
   VITE_MAPTILER_STYLE=your-english-style-id
   ```

Note that a handful of minor roads have no `name:en` in OpenStreetMap and will still render in Chinese.

### Why the basemap is rendered with MapLibre

MapTiler serves pre-rendered **raster** tiles only for its own stock styles; a
**custom** style (which is what carries the English label setting) returns HTTP 403
on the raster endpoint and is available as **vector** tiles instead. So the basemap is
drawn client-side by [MapLibre GL](https://maplibre.org), bridged into Leaflet with
`@maplibre/maplibre-gl-leaflet`. All markers, popups and click-to-add behaviour remain
plain Leaflet — only the basemap layer differs.

MapLibre is ~1 MB, so it is loaded with a dynamic `import()` and Vite emits it as a
separate chunk; it is fetched only when the map mounts, and never at all when the
CARTO fallback is in use.

`maplibre-gl` is pinned to **v5** on purpose. In v6 the tile-parsing worker is a
separate `maplibre-gl-worker.mjs` file loaded through `new URL(..., import.meta.url)`;
Vite's dependency pre-bundling rewrites that to a path the dev server does not serve,
the request 404s, and the basemap renders as an empty background **with no error
logged** — which makes it a slow bug to diagnose. v5 inlines the worker as a blob, so
it is unaffected. Do not upgrade to v6 without re-testing the map end to end.

If the basemap ever fails to initialise, `BaseTileLayer` catches it and falls back to
the CARTO raster tiles, so a broken vector basemap can never leave a blank map.

Because Vite inlines `VITE_*` variables at **build** time, the key must be present in
the deployment environment *before* the build runs — adding it to Vercel afterwards
requires a redeploy to take effect. A MapTiler key used from a browser is necessarily
public; restrict it by allowed origin in the MapTiler dashboard.

Tile providers evaluated and rejected for this use case: raw **OpenStreetMap** and **Esri World Street Map** both label Chinese streets in Chinese, and Esri additionally serves no tiles above zoom 13 in mainland Chinese cities.

## Roles & permissions

| Role | Can view | Can create | Can edit / delete |
|---|---|---|---|
| `admin` | all factories | yes | any factory |
| `business_user` | only factories they created | yes | only their own factories |

Enforcement happens at two levels:
1. **UI** — edit/delete controls are hidden for factories a `business_user` doesn't own.
2. **Database (RLS)** — Postgres row-level security policies in `schema.sql` enforce the same rules independent of the client, so the restriction holds even if the UI is bypassed.

## Deployment

### Vercel
1. Import the repo in Vercel (framework preset: Vite).
2. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables.
3. Deploy. `vercel.json` handles SPA routing (all paths rewrite to `index.html`).

### Netlify
1. Import the repo (`netlify.toml` already sets build command `npm run build` and publish dir `dist`, plus the SPA redirect).
2. Add the same two environment variables under Site settings → Environment variables.
3. Deploy.

## Notes

- Realtime: the map/list auto-refresh when any factory row changes (insert/update/delete), via a Supabase Realtime subscription — useful when multiple users are editing concurrently.
- Mobile: the sidebar collapses behind a menu button below the `md` breakpoint; the map and modals are fully usable on small screens.

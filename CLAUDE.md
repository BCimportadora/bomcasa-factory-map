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

**The catalog's identity is the code's DIGITS; the hyphen is only how it is
written.** The same article is `591103` on a DGA liquidación, `5911-03` on a
proforma and in our master list, and `5911.03` in a few rows of that list where
somebody typed a dot. `code_key` strips everything but digits so all three are
one product; `product_code` holds the hyphenated form because that is what
people here read. `formatProductCode` reinstates the hyphen on six-digit codes
and leaves the 3- and 4-digit legacy codes alone, and it runs on display as well
as on write so rows imported before that rule read correctly without a
migration.

**A zero in the cost sheet's SELLING price columns means we do not sell it, and
a zero in the master list means something else entirely.** `CONTENEDOR 1` — the
only sheet the importer reads — writes `0` against goods that are bought but
never sold, with `USO INTERNO` in `COMENTARIO` and a margin of `-1.00`; their
landed `COSTO UNITARIO` is real, because the goods were paid for. `isNotSold`
recognises those from the comment or from *every* selling price being zero
(never one of them: a line still being priced can carry a single 0), and the
catalog stores `internal_use` with the price left null, because `0.00` reads as
"we sell this for nothing" and a figure invites arithmetic. The trap is the
other sheet in the same workbook: `No tocar` is the 3,627-row master price book,
and its zeros mean "new article, not listed yet" — on Milan 11 they are exactly
the six rows marked `ITEM NUEVO`, all of which have real prices on
`CONTENEDOR 1`. Reading the master list's zeros the same way would silently
strip the prices off six live products. `findHeaderRow` requires `Codigo` and
`Descripcion`, which `No tocar` does not have; keep it that way.

`internal_use` is nullable with no default — null is "no cost sheet has said" —
because `planImport`'s fill-a-blank guard tests for null, and a default of
`false` would assert that every product a liquidación introduced is sold. The
flag and `precio_lista` are ONE statement: a document not allowed to change the
flag does not get to fill the price either, or an older sheet leaves the row
saying both "never sold" and "9.00".

**Which document supplies which field is not arbitrary, and moving one is a
decision.** The liquidación gives the partida arancelaria and nothing priced —
its FOB is rounded to two decimals for the declaration and its gravamen is one
shipment's duty. The proforma gives the barcode, and the two packing figures:
it is the only document that states either. Both are quoted there per CARTON,
and `cbm_unit` is derived — `CBM/CTN / PCS/CTN` — because a cubic metre per
unit is what a container is planned with and what the company's own CODIGOS
workbook prints. Storing the carton volume as well would be a third fact that
is only the product of the other two. Every money figure and the duty
rate come from our own cost sheet, two of them derived rather than read:
`fob_usd = COSTO TOTAL / unidades recibidas` and `gravamen_pct = Gravamen /
CIF pesos * 100`. That the gravamen derived from the cost sheet matches the one
derived from the liquidación is a useful cross-check, not a reason to take it
from the cheaper source.

**Catalog pricing follows the newest ORDER, decided by its number rather than a
date.** Milan 11 supersedes Milan 10, which supersedes Milan 9, and paperwork
arrives out of sequence often enough that importing an old order must not undo a
new one. Dates cannot do this job: a liquidación for an earlier order can be
filed later, and a cost sheet carries no date of its own at all. Numbers are
compared only within the same series — "Klik 76" and "Milan 11" are separate
runs — and where two documents cannot be ranked, `compareDocuments` returns
`unknown` and the disagreement is reported for a person. 'unknown' is
deliberately not 'older': keeping whichever arrived first is a decision nobody
made.

**A liquidación line with no product code still becomes a catalog row.** Spare
drivers and the rechargeable bulbs on Milan 10 carry no code at all, but they do
carry a partida arancelaria, and dropping them loses it. They are keyed
`desc:<description>` instead, and a later coded row for the same goods *adopts*
that row rather than sitting beside it as a duplicate — which is what makes the
result the same whichever document is imported first. Adoption matches on the
description as a prefix, because the cost sheet writes a packing suffix the
declaration omits, and only when exactly one product matches. Two candidates
mean the description identifies nothing, and a tariff code on the wrong product
is worse than one left unattached.

**The `Totales` row is not always on the last page of a liquidación.** A short
declaration puts it on page 1 with only the container and money footer overleaf.
Reading the stated totals from `pages[pages.length - 1]` finds nothing, every
totals check then fails with "not found", and — worse — a page past the Totales
row has no stop bound, so the `FURGONES` table's `1` in the ITEM column becomes
a phantom line item and the row-count check fails against a document that parsed
almost perfectly. Find the Totales row once, read rows up to and including its
page, and ignore everything after.

**One supplier invoice can carry lines from SEVERAL orders, and reading it as
one order is a silent pricing error.** `#77 PIPL ORDER OF YQ-BQ-2603034.xlsx`
invoices order 77 and also ships one line left over from 75 and one from 76,
each under its own `PO.` and `S/C NO.` heading part-way down the sheet. Filing
those two under 77 would tell the catalog they are the newest word on those
products, which is exactly the mistake the newest-order rule exists to prevent.
`parseCommercialInvoice` splits the sheet into blocks and `CatalogImport` plans
one per block, NEWEST FIRST — feeding each block's additions into the list the
next is planned against, or a product shipped under two orders is planned as an
insert twice and the second collides on the unique `code_key`.

The blocks are keyed on the S/C number rather than the PO, because that is what
both sheets carry: `PL` marks its later blocks with the S/C alone and no PO line
at all.

**No two suppliers label these columns alike, and the reader carries every
spelling.** Quantity alone arrives as `Quanity (PCS)` (Klik, typo included),
`QTY` (CHS) and `Unidades` — one field. Worse, WHICH column holds OUR code moves:
Klik writes ours as `Code for Box` and its own as `Item No.`; CHS writes ours as
`Codigo` on the invoice and `Customer Item No.` on the packing list; the Milan
proforma's `Code` is ours again. Reading them the wrong way round files every
product under a code no document of ours uses. `codigo arancelario` is listed
under `arancel` ABOVE `codigo` under `product_code` in `COLUMNS`, because a field
takes the first unclaimed column whose heading begins with one of its patterns —
the tariff column would otherwise be swallowed as the article code.

**`OUR_COST_SHEET` is what stops the invoice reader eating our own workbooks.** A
supplier invoice and our landed-cost sheet can both head a column `Codigo` beside
one headed `Descripcion`, which is all either reader looks for. Without the
guard, CHS's invoice is claimed on `Codigo` — and so are our own cost sheets,
whose FOB dollars would then land in the catalog's peso columns. No supplier
writes `CIF PESOS` or `COSTO UNITARIO` on an invoice to us, so those headings
mean the sheet is ours and the invoice reader must decline it.

A packing list is found by its CARTONS column or its volume column, not the
volume alone: CHS numbers cartons under a clear heading and leaves the volume in
an unlabelled formula. And a data row is one carrying an article code — the
S/No. is a second opinion, used only where that column exists, because CHS's
invoice has none.

The invoice states a real unit price and the catalog deliberately ignores it:
every figure with a currency on it still comes from our own cost sheet, which
derives the same number after the goods landed and is the only document that
also knows what they cost us here. Which is why EITHER SHEET ALONE is accepted:
no money is read from this document, so `PL` on its own carries the full set.
What a lone `PL` loses is the order number, not a field — this supplier marks
its later blocks with the S/C alone and prints the PO only in the sheet header.

**`Number(null)` is 0, and that made a missing figure read as a real zero.**
`perUnit` and `gravamenPct` both divide, and both used to guard only with
`Number.isFinite`, which a null passes. So an invoice line with no volume came
out as a CBM of `0.000000` — a figure somebody would plan a container with —
and a null gravamen as `0.00 %`, which is a real and different answer, because
the Milan bulbs genuinely are duty-free. Both now test `isBlank` first, which
stops a null and still lets a true zero through.

**A supplier proforma's header is two rows deep, and the sub-headings are
BELOW.** The top row carries `No.`, `Code` and the merged group headings
(`QUANTITY`, `FOB PRICE`); the row under it carries `Q'TY`, `UNIT PRICE`,
`English`, `Spanish`. Columns A–E are merged down across both, so their labels
appear only on the top row. Reading one row and not the other loses half the
columns in silence: the prices and the Spanish description come back empty and
everything else looks perfect. The invoice number is under its label too, not
beside it — the cell to the right is the next label.

**`t()` returns the KEY when a string is missing, so it can never be the left
side of a `||` fallback.** That is right for our own labels — a missing one
shows up in development instead of rendering blank — and wrong for text that
came from somewhere else. An error thrown by a library carries a sentence, so
`t(`catalog.errors.${err.message}`) || err.message` finds nothing, hands back
the key it was given, and shows the user
`catalog.errors.Setting up fake worker failed: …` with the prefix attached.
`tOr(key, fallback)` is the way to ask for a translation that may not exist.

**A Vite `?url` import must be STATIC.** `import workerUrl from
'pdfjs-dist/build/pdf.worker.min.mjs?url'` works; `await import('...?url')`
resolves in a production build and 404s in dev, surfacing as "Failed to fetch
dynamically imported module". This is the same shape as the maplibre worker note
above, and it is worth re-reading that one before reaching for a dynamic import
of any worker. `?url` yields a string, so importing it statically costs a few
bytes and does not drag the library into the main bundle — the heavy
`pdfjs-dist/build/pdf.mjs` stays behind its own dynamic import, and Vite emits
the worker as a separate asset either way.

**Never leave a customer spreadsheet in `public/`.** Verifying the parser means
serving a real workbook to the dev server, and `public/` is copied verbatim into
`dist/` and deployed. Delete it the moment the check passes, and confirm with
`find . -name '*.xlsx' -not -path './node_modules/*'` before committing.

The part that catches people out: a build run while the fixture is still in
`public/` copies it into `dist/`, and removing it from `public/` afterwards does
**not** remove it from `dist/` — the next deploy ships it. Search the whole tree,
not just `public/`, and rebuild after deleting.

**An order can arrive in two parts and is still ONE order.** A container sails
while a few thousand pieces fly, because they were needed sooner or missed the
sailing; the supplier invoices both together and notes the flown quantity in the
margin. So the mode lives on `order_items.shipment` — that is what differs, line
by line — and the air leg's own paperwork sits beside the sea leg's as
`orders.air_awb` / `air_etd` / `air_eta`. Splitting it into two orders would
break the numbering that decides whose pricing is current, and a shipments table
would model N legs nobody has at the cost of a join, a second set of RLS policies
and a rewrite of `replaceItems`. `shipment` defaults to `'sea'` because every row
that predates the column travelled in a container.

**A line the invoice bills and the packing list omits is a question, not a
fact.** It is either an air shipment or a document contradicting itself, and
only somebody who knows the order can say which — so `CatalogImport` blocks the
import until it is answered. The supplier writes the answer in the margin more
often than not (`By air-2000PCS` on the invoice, `2000pcs by air` on the packing
list), and `airNote` looks for it in EVERY cell of the row because on this
document it sits one column past the labelled Remark, which holds the general
terms. Those quantities are shown and never stored: they do not always agree
with the invoiced ones — 3409-89 is invoiced 600 and noted "1080PCS BY AIR".

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

**A factory has two names and only one of them is its identity.** `name` is the
legal one and stays the key: the CSV import matches on `factoryNameKey(name)`,
so renaming a supplier there still creates a duplicate, and nothing was made
safer by adding `nickname`. The nickname is a display alias — `factoryLabel()`
prefers it everywhere a person reads a supplier (orders, files, the list, the
map popup, the measure panel) while the legal name stays visible underneath,
because that is what a customs agent needs.

The reason it earns its place is `guessFactory`: an order reference IS the
nickname plus a number, so "KLIK 76" resolves to Wenzhou Yueqiu Bakelite
Electric Appliances — which the old rule, looking for the word inside the legal
name, could never do, because most of these nicknames appear nowhere in the
company's name. Exact nickname match first, substring-of-legal-name only as the
fallback for suppliers nobody has nicknamed.

The real list lives in `supabase/set-factory-nicknames.sql`, loaded from the
company's own `apodos.xlsx`. Of 29 suppliers, only about a third have a
nickname their legal name contains.

Two rows matching is usually ONE company with a plant and a sales office, so
`soleOrPlant` picks the plant rather than giving up; only a genuine tie between
different suppliers returns null and makes a person choose. There is
deliberately no unique constraint on `nickname` in the database — that office
row is a legitimate second holder of the same nickname.

**The nickname is the one CSV column that is absent-means-untouched.** Every
other field in `parseFactoriesCsv` reads a missing column as an empty value,
which is right for columns that have always existed. A CSV exported before
nicknames has no such column, and treating that as "clear it" would strip the
nickname off every supplier the first time somebody re-imported an old file. A
column that is present but blank still clears it, which is how you clear one.

**`useFactories` and `useOrders` name their realtime channel with a fixed
string.** So two live instances of either hook collide on one Supabase channel
and throw `cannot add postgres_changes callbacks ... after subscribe()`. That
never happens in the application, because the pages that use them are separate
routes — but it does happen the moment anything renders two at once, and the
error names the channel rather than the mount, so it reads like a Supabase
fault. `useOrderFiles` avoids it by putting the order id in the channel name;
keep that if a second file list is ever mounted beside the first.

**Never decide whether to insert a row from realtime-backed state.** The list a
hook exposes — `factories`, `orders`, `innovations` — is only refreshed when its
subscription fires, and `createX` does not refetch, so a component reads
whatever its closure captured at render time. That is fine for display and
wrong for "does this already exist?". The CSV import answered that question from
`factories` and so re-inserted all 29 suppliers when run a second time, or when
run before the first load had landed: the map ended up with a duplicate of very
nearly every factory, and undoing it needed a data repair
(`supabase/merge-duplicate-factories.sql`) rather than a code change. Ask the
database when the answer has to be true — `listFactories()` in `useFactories`
returns the rows instead of pushing them into state, and any future bulk import
should do the same.

**Merging duplicate factories is not a `delete`.** `orders.factory_id` and
`innovation_quotes.factory_id` are both `on delete set null`, so removing a
duplicate row silently blanks the supplier on everything attached to it instead
of moving it. Repoint both first, assert nothing still references the losing
rows, and only then delete — which is the order the merge script uses. It is
also one `do $$ … $$` block rather than a `begin`/`commit` script with a temp
table, because the Supabase SQL editor goes through a connection pooler and
consecutive statements are not guaranteed to share a session: the temp table
disappears between them and the next statement fails with `relation … does not
exist`.

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

**The print sheets are the screens that ignore the theme.** `/innovations/print`
and `/catalog/print` hard-code black on white and skip `AppLayout` entirely, and
`@media print` in `index.css` forces `background: #fff` past the dark tokens.
Printing a night-mode page either wastes a cartridge on a black rectangle or,
with backgrounds off, prints pale grey text on white. This is a deliberate
exception to the colours-are-tokens rule below, not an oversight. What to print
lives in the query string (`?supplier=…`), not in state, so a link to one
supplier's price sheet opens the same thing for whoever is sent it.

**The catalog sheet's `@page` rule is injected by the component, not written in
`index.css`.** It carries two declarations. `size: landscape` turns the paper,
because the sheet reproduces the column set of the company's own
`CODIGOS INTERRUPTORES` workbook -- ten columns, two of them descriptions --
which does not fit portrait. The keyword is bare rather than `A4 landscape` so
whoever prints keeps their own paper size. `margin: 0` is what removes the
browser's own header and footer — the date, the page title, the URL and "1/4" — by leaving no margin
for them to sit in; there is no other way to suppress them from a page. It
cannot go in `index.css` because `@page` takes no selector and would then apply
to the innovations sheet too, which is laid out for the global 14mm. A `<style>`
rendered inside `CatalogPrintPage` exists in the document only while that route
is mounted, and being later in the cascade it wins. If a print ever comes out
with content against the paper edge, check the print dialog's Margins is on
Default — a custom setting there overrides `@page` entirely.

With no page margin the sheet supplies its own, and **the top and bottom ones
are carried by the repeating `thead` and `tfoot`**, not by padding. Horizontal
padding survives a page break so it applies to every sheet; vertical padding
does not — it is drawn once at the start of the box and once at the end, so
pages two onwards would print flush to the paper edge and lose a row to the
printer's unprintable area. `table-header-group` and `table-footer-group` repeat
on every page, which is what makes their padding a per-page margin.

**A catalog product's supplier is derived, not stored.** There is deliberately
no `factory_id` on `catalog`: the supplier is already recorded once, on the
order the paperwork came from, and `doc_ref` / `cost_ref` hold that order's
reference. `supplierIndex` resolves it from the `orders` row with that exact
reference — authoritative, because a person confirmed the supplier at import —
and falls back to matching the reference's word against the nicknames, which is
what covers orders that predate the platform. Storing it as well would give one
fact two homes, and correcting the supplier on an order would leave the catalog
still holding the old answer. The cost is that CatalogPage mounts `useFactories`
and `useOrders` alongside `useCatalog`; that is safe only because these are all
page-level and no two of those pages render at once — see the fixed-channel note
below.

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

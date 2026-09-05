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

**XML attribute order carries no meaning, and the reader must not assume one.**
`workbook.xml.rels` says the same thing either way round, but Excel writes `Id`
before `Target` and openpyxl writes `Target` before `Id`. A pattern pinning that
order matched nothing on the second: every relationship was lost, every sheet
was skipped for having no target, and a perfectly good one-sheet workbook came
back as "That file contains no worksheets" — a message pointing nowhere near the
cause. `attribute()` reads them in any order, and `<sheet>`'s `name` and `r:id`
go through it too, being equally free to swap. Anything not written by Excel —
openpyxl, Google Sheets, LibreOffice — can trip this.

**openpyxl writes a formula with NO cached value, and this reader reads the
cache.** So a spreadsheet generated for the importer must carry literals in
every column the site reads; a formula there arrives as an empty cell. Derived
columns meant for a person are fine as formulas — Excel fills them on open.

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

**An order reference is a supplier and a number, and the form asks for them
separately.** "CHS 09", "Klik 78", "Milan 11" — the number is what decides whose
pricing the catalog treats as current, so typed as one free-text box it comes
out inconsistent and the ranking silently stops working. `OrderForm` composes
the reference from the chosen supplier's nickname and a `No.` field, and stops
composing the moment somebody edits the reference by hand. The number is carried
as TEXT: they write `09`, and a round trip through `Number` hands back `9`.

`orderPriority` also accepts a title that runs on — our CHS cost sheet is headed
`CHS09 CANALETAS NEGRAS`. The digits must be GLUED to the letters for that
fallback to fire, because `ORDEN 11 MILANLUX` has a space there and its `11`
means something else; that one stays unranked, as it always was. `supplierIndex`
asks `orderPriority` for the series before falling back to the whole word, or
`CHS09 CANALETAS NEGRAS` would strip to `CHS CANALETAS NEGRAS` and match no
nickname.

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

**A liquidación line with no product code attaches to a product we already have,
or it is REPORTED. It does not create one.** It matches on the description as a
prefix — the cost sheet writes a packing suffix the declaration omits — and only
when exactly one product matches: two candidates mean the description identifies
nothing, and a tariff code on the wrong product is worse than one left
unattached. A line that matches nothing goes to `failed`, which is itemised on
screen, rather than into a count nobody reads.

It used to fall back to a row keyed `desc:<description>` so a declaration could
introduce goods our paperwork had not reached. That was written for Milan, where
ONE line of seventeen lacks a code. CHS 09's declaration carries **no codes at
all**: all thirty-one lines took the fallback, ten of them described only as
`GRAPA` — and because the key IS the description, those ten collapsed into a
single row while eleven more lines were dropped as duplicates of each other.
Twenty rows survived, every one of them named in customs wording. Measured on
the three real declarations, the new rule creates no row carrying customs
wording at all, and CHS 09's tariff codes still land on the products the cost
sheet had already named.

Rows created under the old rule are still there, still keyed `desc:`, and a
coded line still adopts them — that path is kept precisely because those rows
exist. `select * from catalog where code_key like 'desc:%'` lists them.

**A product carries EVERY order it has appeared in, and that is what scopes a
declaration.** `doc_ref` and `cost_ref` each hold one reference and advance to
the newest, which is right for deciding whose pricing is current and useless for
asking "was this part of Klik 61?" -- after the 77 paperwork lands, both say 77.
`catalog.order_refs` is a text[] that only grows: a product bought in 61, 62 and
77 answers yes to all three. Every importer adds its own `docRef` to it, as
`tags` on the plan, applied as a plain write rather than through the fill or
refresh guards -- a set that only grows has no "already filled" state to protect.

The arancel document names no order ANYWHERE. Its header carries the
declaration and liquidation numbers, the dates, the consignee, the manifest and
the agency, and nothing else -- checked against all four real declarations. So a
person picks the order at import, and that choice IS the scope: the declaration
may classify only products tagged with it, and it may never create one. Verified
on the real CHS 09 declaration: chosen against CHS 09 it classifies 8 and
reports 23; chosen against MILAN 11 it touches nothing at all.

**The customs agent runs our description and the factory's code together.**
It is NOT our wording plus a code, which was the first guess and is wrong. On
KLIK 61's declaration the agent writes `TOMA CORRIENTE DOBLE KOLNY R6C` where we
write `TOMA CORRIENTE DOBLE KOLNY/BLANCO (10/1)`, and `TAPA CIEGA KOLNY RSBLACK`
where we write `TAPA CIEGA, KOLNY/BLANCO (16/1)`. Neither is a prefix of the
other, so all ten lines matched nothing.

`descriptionCandidates` peels the last token or two and returns candidates,
LONGEST FIRST. There is deliberately no test on what the tail looks like: Klik's
codes are `R6C`, `R6CT`, `RDIMMER`, `RSBLACK` -- plain letters, the same shape as
KOLNY or BLANCA -- so any rule that spared our own words would spare theirs too
and match nothing. A first attempt did exactly that and matched 0 of 10. Order is
the safeguard instead: the whole description is tried first, so a product whose
real name ends in such a word matches before anything is peeled, and
`matchByDescription` still demands exactly ONE hit. With the guard removed the
same declaration matches 10 of 10.

`trailingSupplierCode` reports the LAST word of what had to be dropped, not a
suffix of our stored name -- the two wordings differ too much for that.
`INTERRUPTOR SENCILLO KOLNY R1K` loses `KOLNY R1K` to reach `INTERRUPTOR
SENCILLO PEQUEÑO, KOLNY/BLANCO`, and the code is the last token because our
description always comes first. Reported only, never written to
`supplier_code`.

**Two wordings of one article are a question for a person.**
`descriptionSimilarity` scores by shared words, not edit distance: these are the
same goods described twice, so what differs is a word or two, not letters within
words. Weighted toward the SHORTER description, with a floor of TWO shared
words -- without that floor the customs line "GRAPA" scores a perfect 1.0
against "GRAPA ELECTRICA KOLNY GRIS RCC-10", and against every other clip in the
catalog. A near miss is reported with both wordings side by side; nothing is
ever merged automatically.

**`.includes('')` is true, and it silently switched the catalog search off.**
The filter ended with `(p.barcode ?? '').includes(needle.replace(/\D/g, ''))`.
A search with no digits -- "toma corriente doble", which is most of them --
reduced to `.includes('')`, matched every product that had a barcode, and
returned the whole catalog. It read as "search is broken, I have to scan
everything", which is exactly what it was doing. The barcode arm is now reached
only when the query actually has digits, and text is compared through
`normalise` rather than `toLowerCase`, so MARRON finds MARRON and `(100 mm)`
finds `100mm`.

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

**But a block's S/C alone is NOT the import key, and using it as one silently
lost a shipment.** The dedup key must be the DOCUMENT plus the block within it,
because two different files legitimately mention the same order. `#77 PIPL` is
43 lines of order 77 plus one left-over line of 75 and one of 76 — so keyed on
the block's S/C, importing it claimed `YQ-BQ-2601011` on the strength of ONE
line, and `KLIK 76 PIPL.xlsx` — the real order 76, 43 lines under that same S/C
— was refused as already imported with the message "importing it again would
change nothing", while 42 products never arrived. `docKeyOf` is now
`<invoice no. or header S/C or file name>|<block S/C or index>`. The index half
only ever fires for a supplier that writes no S/C on the block (CHS, which has a
single block, so it is always 0) and is taken from the ORIGINAL block order, not
the newest-first order the planner walks, or the key would move between two
imports of one file.

Changing that scheme orphaned the `catalog_imports` rows written under the old
keys. They block nothing — the check looks up the new key — so a document
imported before the fix simply offers itself again, and re-importing it is
harmless: it ranks 'same' against itself and only fills blanks.

**Not every supplier writes a PO, and without one the whole shipment lands under
no supplier.** CHS heads its invoice `Invoice No.:CHLPI240718A` and states no PO
and no S/C anywhere -- so `orderNumber` is null, `invoiceReference` returns null,
and 29 products import perfectly into no section at all. The parser has always
warned `noOrderNumber`; what was missing was somewhere to answer it, so
`CatalogImport` asks for the number beside the supplier, exactly as `OrderForm`
does. It is offered ONLY when a block states none: a file that names its POs
needs nothing typed, and a file that names none has a single block, so one typed
number can never be spread across two orders. Carried as text, like everywhere
else -- they write `09`, and a round trip through `Number` hands back `9`.

That document also dates itself `Date.:July 18th,2024` -- a full stop AND a
colon, and a month in words. Neither got past a regex expecting `Date: 2026.03.18`,
so the invoice came out undated, which matters wherever the order numbers cannot
rank two documents. `readDate` takes both spellings. And the invoice number is
what keys the import: without it the document falls back to the FILE NAME, which
is ours to rename -- this one reached us as `CHS 09 detail.xlsx`, a name the
supplier never wrote, so re-importing it under any other name would not be
recognised as the same document.

**Which document supplied a field is recorded like the field itself: filled when
blank, replaced only by a newer document.** Writing `doc_ref`/`cost_ref` only on
`newer` left a hole that is invisible until you import two documents for the SAME
order. A cost sheet and an invoice for CHS 09 rank as 'same', not 'newer' -- so
importing the invoice first and the cost sheet second filled every priced column
and then recorded no `cost_ref` at all, because there was nothing older to beat.
The same two files in the other order produced a row that DID carry it. Identical
documents, different result, and a blank reference is precisely what puts a
product in no supplier's section. The fill is applied with the same
`.is(field, null)` guard as any other, so it still cannot clobber.

**A cost sheet states its own order and the catalog importer used to drop it.**
`parseLiquidation` returns `reference` -- "CHS 09", "MILAN 11", read from above
the table -- and `CatalogImport` passed it to the import record but never to
`planImport`, so `cost_ref` was null on every cost sheet ever imported. The
column, `REF_FIELD_FOR.costo` and the supplier lookup that reads it were all
already there; only the argument was missing.

**No two suppliers label these columns alike, and the reader carries every
spelling in both languages.** Quantity alone arrives as `Quanity (PCS)` (Klik,
typo included), `QTY` (CHS), `Quantity`, `Q'TY`, `Unidades` and `Cantidad` — one
field. A heading matches as a PREFIX, which is what finds `Unit Price FOB
SHANGHAI` without listing every tail a supplier appends; patterns short enough
to start an unrelated heading carry an `exact` flag instead. `no` is the one
that matters: as a prefix it swallows `No. of Package (CTNS)` and takes the
cartons column with it, so the line number is only ever claimed by an exact
match. `CODE_HEADINGS` is derived from the same table, so adding a synonym for
our article code is a one-line change rather than two. Worse, WHICH column holds OUR code moves:
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

**A supplier states the volume one of two ways, and the second one is the
carton's dimensions.** Klik heads a column `Volume (CBM)`. CHS heads one
`CTN SIZE (CM)`, writes `54*32*35`, and multiplies it out in an unlabelled
formula further along the row that no heading can find — so its whole shipment
imported with no CBM at all. `cartonVolume` multiplies the three sides and
divides by the cartons; against the supplier's own unlabelled column that
reproduces all 31 lines of CHS 09 to the sixth decimal, which makes it their
arithmetic rather than an estimate of it. The unit comes from the HEADING, never
from the magnitude: a carton 202 cm long and one 202 mm long are both entirely
ordinary, and guessing wrong is a 1000× error in a figure somebody plans a
container with. A heading naming no unit is read as centimetres.

Their proforma PDF, which is what one reaches for first, has no volume column at
all — the packing list is the only document that states it.

**One article code can appear on a packing list TWICE, and pairing it with the
invoice by code alone silently mixes two shipments.** CHS 09 ships 2002-03 as
3 cartons of 1500 and again as 1 carton of 500, and both sheets list the two
runs in the same order. A `Map` keyed on the code kept only the LAST run, which
was then paired with the FIRST invoice line — 1 carton against 1500 pieces. That
is not a packing this shipment contains: it made 2038-02 read 127 pieces per
carton, a figure nothing else in the file supports, and it would have given the
same product a CBM per unit to match. The runs are kept as a list and consumed
in step with the invoice's own repeats, so the nth line for a code meets the nth
run of it. A code invoiced more often than it is packed falls back to the last
run rather than to nothing — the goods ARE on the packing list.

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

**CUENTA T does not reconcile with the cost sheet beside it, and the cost-sheet
formatter must never present it as if it did.** On Milan 11 `CUENTA T!D7`
(FLETE MARITIMO) is 659,519.20 pesos while the sheet's own `F10` is 7,030 USD --
at the sheet's rate of 58.55 that would be 11,264, not 7,030. Its CIF totals
disagree too: 2,046,739 pesos against the sheet's 2,968,391 on Milan 11, and
1,397,747 against 2,833,361 on CHS 09. CUENTA T is an ACCOUNT covering a
different scope, not a restatement of the container. So the formatter offers its
freight and insurance as a prefill with the cell they came from shown, expects a
person to correct them, and warns when the derived CIF PESOS drifts from the one
the old sheet had pasted in from the declaration. Do not "fix" that warning by
reconciling the two.

**The duty rate lives inside a formula, so it is recovered by division.** The
old sheet writes `=G11*0.2` and this platform's reader takes cached values, not
formulas -- so the rate is `duty / CIF`, which lands on 0.19999999999999998 as
often as on 0.2. `snapRate` snaps to the five the header offers within 1e-6 and
otherwise keeps the figure exactly as found and reports it. A duty rate nobody
recognises is a question, not something to round away.

**One code on the old CHS sheet is a NUMBER and its `No tocar` holds text.**
`B22` is `2014`, not `'2014'`. A VLOOKUP across that mismatch returns `#N/A` on
exactly one line of a thirty-one line sheet -- the worst kind of failure, since
thirty lines look perfect. The generator writes column B and the generated
lookup's column A both as inline strings through `formatProductCode`, which
removes the class of failure rather than the instance.

**The cost-sheet reader needs more than `Codigo` beside `Descripcion`.** CHS's
commercial invoice heads its columns exactly that way, and reading it as one of
ours would put FOB dollars into peso columns. `findHeaderRow` in
`costSheetSource.js` also requires a heading no supplier writes on an invoice to
us -- `CIF PESOS`, `CIF DOLARES`, `Costo unitario`, `Unidades Recibidas` or
`Total puesto en almacen`. This is the same guard `OUR_COST_SHEET` applies from
the invoice reader's side; the two must stay in agreement.

**A generated .xlsx must carry `<v>` beside every `<f>`.** openpyxl writes
formulas with no cached value, and the note above about the cost sheet's cache
says what that costs: our own readers take the cache, so the file comes back as
a sheet of blanks. `costSheetWriter.js` writes both. A formula returning TEXT --
the description VLOOKUP -- additionally needs `t="str"` on the cell, or the
cached value is parsed as a number and silently dropped.

**`t()` returning a key is also a trap for a `not in` guard.** Splicing the
cost-sheet strings in was blocked by a check for `'costSheet' not in bundle`,
which matched the unrelated, pre-existing `catalog.…costSheet` label. Guard on
the exact top-level shape — a newline, two spaces, then `costSheet: {` — rather
than on a bare substring. (Writing that guard is itself the other trap on this
page: a bash heredoc ate one backslash level and turned the escape into a real
line break. Use the Edit tool for anything carrying escapes.)

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

**The document itself must never scroll, and `html`/`body` carry
`overflow: hidden` to guarantee it.** Every page is its own scroll container —
`h-full overflow-y-auto` on each page root — so a scrollbar on the window is
always a leak. One appeared: with the catalog's table in a scroll box, `body`
measured 698 tall with 698 of content, and `html` measured 698 with **1656**.
Every element from the table up to `body` was contained; the excess showed up
between `body` and `html`, where there is nothing to contain it. The window
scrolled 958px into blank space below the application, which is what "I can
scroll past the limit" meant.

Setting `overflow: hidden` there does not change what `scrollHeight` reports —
it still says 1656 — but it stops the wheel and the scrollbar, which is the
whole of the symptom, and nothing is made unreachable because every ancestor
already contained its content. `@media print` lifts it with
`overflow: visible !important`, or the catalog would print one sheet and stop.

If a page ever appears to lose content off the bottom, this rule is the first
place to look — but the fix is to give that page its own scroll container,
not to remove this.

**A `max-h-[Nvh]` inside a container that is already the viewport's height
overflows it.** The catalog table was capped at `70vh` so its header could be
sticky — but the table sits below ~250px of page header and filters, inside a
page container that is exactly `h-full`. 250 + 630 + pagination came to 905px
in a 900px window: five pixels of dead scroll, and two nested scrollbars where
there had been one. A viewport unit cannot know what is above it. From `lg` the
page is a flex column that does not scroll and the table takes `flex-1
min-h-0` — the remainder, whatever that is. `min-h-0` is not optional: without
it a flex child refuses to shrink below its content and the overflow comes
straight back.

**Only from `lg`, and that is a decision the company made, not a default.**
Below it the page scrolls as it always did and the table keeps its natural
height — all twenty-five rows in one run, no sticky header. Filling the height
was tried at `md` and rejected: on the machine that reported the bug it left
six rows visible, and reading twenty-five at a stretch was worth more to them
than pinned column labels. Do not "fix" this back to `md` without asking.

Worth knowing before touching that breakpoint: **Windows at 125% turns a
1280px monitor into 982 CSS pixels**, so a real PC in this office sits UNDER
the 1024px `lg` line and gets the phone layout — hamburger instead of the
sidebar, and no sticky header. That is why the desktop branch appeared to do
nothing when it was first shipped. Test any breakpoint change at 982×730, not
just at 1440.

The table also carries `lg:min-h-[18rem]`, and the page is `lg:overflow-auto`
rather than `overflow-hidden`. At 768×600 the header and filters take
everything and the table collapsed to 136px — two rows. The floor stops that;
`overflow-auto` is what lets the page scroll on a window too short to honour
the floor, instead of clipping the list. A non-zero `min-height` still
overrides the flex default of `auto`, so the shrink that makes all of this
work is unaffected.

`.print-flow` is what lets that column collapse back into ordinary flow on
paper. A flex column pinned to the window's height prints one page and clips
the rest.

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

**A product can carry three descriptions and the table used to show only one.**
`description` is our own cost sheet's wording, `description_es` and
`description_en` are the supplier's — and CHS and Klik each state theirs in one
language only. A supplier document is often the FIRST thing imported for an
order, so a catalog built from invoices alone had an em dash in every
Descripción cell while the text sat one column away in the same row. The search
had always looked at all three; `productDescription` is what makes the table
agree with it.

**The DGA declaration READS the description and must never WRITE it.** It words
the same goods the way a customs agent has to declare them -- `BOMBILLO LED
TRADICIONAL 9W 6500K 60/108MM (25/1) (50) KOLNY` against our cost sheet's
`...60/108mm (25/1)(50) KOLNY`, all caps and spaced differently -- and that is
not a name anybody here uses. Once it was in `description` a later cost sheet
could not correct it either: the two write different columns (`doc_ref` against
`cost_ref`), so a cost sheet arriving afterwards compares itself against a blank
`cost_ref`, ranks `unknown`, and an `unknown` relation is REPORTED as a conflict
rather than applied. So the field silently stayed wrong.

The declaration still needs the text, which is why it is withheld in
`planImport` rather than dropped from `fromLiquidacionRow`: an uncoded line is
matched on it, and a coded line adopts a `desc:` orphan by it. It is held once
as `declared` and deleted from `fields` outright -- unconditionally, since an
unmatched line no longer becomes a row whose only name it would be. Doing this
by deleting the key at the right moment instead made three lookups depend on
statement order and quietly broke adoption; the test caught it, which is why
`declared` exists as its own variable.

Rows imported before this are NOT healed by it. Their `description` still holds
the customs wording, and re-importing the cost sheet reports a conflict rather
than replacing it. `select count(*) from catalog where description is not null
and cost_ref is null` counts the ones no cost sheet has ever touched.

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

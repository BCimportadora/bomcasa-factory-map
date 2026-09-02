# Cost Sheet Formatter

Converts an old-layout cost sheet ("liquidación de costo") onto the current
format, and reports everything the old file cannot answer instead of filling it
in.

- Route: `/cost-sheet`, section id `costSheet`, in the **Documents** group.
- Modules: `src/lib/costSheetSource.js` (reading), `src/lib/costSheetModel.js`
  (calculation and findings), `src/lib/costSheetWriter.js` (the generator),
  `src/pages/CostSheetPage.jsx` + `src/components/CostSheet/*` (interface).

---

## What the sample files actually said

The brief described these from memory. Where the files disagreed, the files won.
Everything in this section was checked against the real workbooks.

**The sample files were not in `docs/samples/`.** That directory does not exist.
They were read from `C:\Users\compr\Documents\` as
`LIQUIDACION COSTO MILANLUX ORDEN 11.xlsx`, `LIQUIDACION CHS 09 - copia.xlsx`
and `CHS 09 detail.xlsx`. Nothing was copied into the repository — see
"Never leave a customer spreadsheet in `public/`" in CLAUDE.md; the throwaway
harness that served them to a browser was deleted and the whole tree checked
with `find . -name '*.xlsx' -not -path './node_modules/*'` afterwards.

**The old format DOES have a pricing block.** The brief said point 5, "NO
pricing block at all — nothing equivalent to target columns W through AE". In
fact `Precios` carries `Costo unitario`, `MAS 4%V/DIVISA`, `MARGEN BENEFICIOS`,
`PRECIO VENTA S/ITBIS`, `PRECIO VENTA C/ITBIS`, `PRECIO LISTA Actual` and
`VOLUMEN VENTA ESPERADO` in columns U–AA. What it genuinely lacks is
`SUGERENCIA DE PRECIO` and `COMENTARIO`, and — the substantive difference — its
`PRECIO LISTA` is a typed literal rather than a VLOOKUP.

**The old sheet has an extra column the brief did not list.** Column E is
`Precio FOB`, a unit price, and column F `Costo Total` is `=C*E`. The current
format states only the line amount, in column E. So old F maps to new E, and old
E has no counterpart. The reader keeps both.

**The old sheet's seven local expenses are worded differently, and one is
empty.** `ALMACENAJE PUERTO O DPW`, `PORT COLLET`, `INSPECCION QIMA`,
`MANEJO LOCAL MC` against the target's `ALMACENAJE PUERTO DPW`,
`DPH O PORTCOLLECT`, `QIMA INSPECCION`, `MANEJO LOCAL`. They are matched by
heading, never by position. On CHS 09 the seventh (`MANEJO LOCAL MC`) has **no
amount at all** — which is the feature's first real test, and it blocks the
download until somebody states it, even if the answer is 0.

**The old sheet's last local charge uses a different allocation driver.** Its
column S is `=+G11/$G$42*$S$9` — prorated by CIF PESOS, not by the tax-paid
total like the other six. Since `$S$9` is empty this evaluates to 0 throughout,
so nothing depended on it. The converted sheet puts all seven on the target's
single driver (column N), as the target does.

**The target sample's `Totales` row does not total column K.** `Selectivo` has
no SUM. Generated sheets add one — a column with no total reads as a generator
that forgot one. Numerically it changes nothing here, since Selectivo is 0.

**The target sample's AC total excludes its last row.** `AC29` is
`=SUM(AC12:AC27)` over 17 data rows ending at 28. Generated sheets sum the full
data range. `AC28` is 0, so this changes no number in the sample.

**Column AD is not always manual, and column AB is not always a VLOOKUP.** The
brief said AD is manual. In the target, rows marked `AJUSTAR PRECIO` carry
`AD = +X*1.18*1.12*1.8`, and rows marked `ITEM NUEVO` put that same formula in
**AB** instead of the VLOOKUP. Both depend on a human judgement about that
product. See "list price" under Assumptions for what is generated instead.

**The duplicated line number is real.** Rows 27 and 28 of the target are both
numbered 16, as the brief said. Generated sheets renumber from 1 with no
duplicates, and this is asserted in the checks.

**`CUENTA T` does not reconcile with the cost sheet, in either sample.** This is
the most important finding here and it is not a defect in the reader. For Milan
11, `CUENTA T!D7` (FLETE MARITIMO) is 659,519.20 while the cost sheet's `F10` is
7,030 USD; at the sheet's own rate of 58.55 that would be 11,264 USD, not 7,030.
CUENTA T's CIF totals likewise differ from the cost sheet's — 2,046,739 pesos
against 2,968,391 on Milan 11, and 1,397,747 against 2,833,361 on CHS 09.
CUENTA T is an account covering a different scope, not a restatement of the
sheet. Consequently **the freight and insurance it supplies are offered as a
prefill with their source shown, and are expected to be corrected by a person.**
The interface never presents them as authoritative.

---

## The four decisions

Each is a visible control in the shipment-details form, changing it recomputes
the preview immediately, and the choice is written onto the generated workbook's
`NOTAS` sheet.

| # | Decision | Default | Where |
|---|---|---|---|
| 1 | **ITBIS base** — `(CIF + Gravamen) × 0.18` or `(CIF + Gravamen + Selectivo) × 0.18` | Without Selectivo (matches the target) | "Decisiones" → "Base del ITBIS" |
| 2 | **Exchange rate** — every rate found in CUENTA T, each labelled with where it came from and its value, plus Manual | DGII if present, otherwise the average | "Datos del embarque" → "Tasa de cambio" |
| 3 | **Freight/insurance currency** — USD, or RD$ converted at the chosen rate | RD$ when read from CUENTA T, USD when the header stated them or you typed them | "Datos del embarque" → "Moneda del flete y el seguro" |
| 4 | **Duty rate source** — the old sheet's own per-row rate, or the invoice's tariff code | The old cost sheet | "Decisiones" → "Origen del gravamen" |

On CHS 09 the four rates offered are Initial 52.440 (`CUENTA T!I7`), Completive
56.400 (`I8`), DGII 55.156 (`L8`) and Average 54.420 (`I9`).

---

## Assumptions

**The duty rate is recovered by division, then snapped.** The rate is never
written on the sheet — it lives inside `=G11*0.2`, and this platform's reader
sees cached values, not formulas. So it is recovered as `duty / CIF` and snapped
to one of `{0, 0.20, 0.14, 0.03, 0.08}` when it lands within 1e-6. Anything that
does not snap is kept exactly as found and raises a warning; nothing is rounded
away silently. On CHS 09 all 31 lines snap cleanly (18 at 0.20, 13 at 0.14).

**A tariff code is not a rate.** Decision 4's second option says "from CÓDIGO
ARANCELARIO in the commercial invoice", but an invoice states a partida, not a
percentage. The rate is therefore resolved through the Catalog's own recorded
`arancel` → `gravamen_pct` pairs, and **only where every product under that
partida agrees**. A partida carrying two different rates in the Catalog
identifies nothing, so those lines fall back to the other source and are
flagged. Nothing is inferred from the tariff code itself.

**The arithmetic is IEEE-754, not decimal.** The constraint said "money as
decimal, never float", and the acceptance criteria said the downloaded file must
recalculate to the same numbers as the preview. Those two cannot both hold:
Excel recalculates live formulas in binary doubles, so a preview computed in
arbitrary-precision decimal would be *guaranteed* to disagree with the file it
previews. The resolution: everything a person **states** is parsed exactly from
its own text and never round-tripped through arithmetic (`parseAmount` accepts
both `1.234,56` and `1,234.56`); every **derived** cell is computed in the same
doubles Excel will use, accumulating sums in row order as Excel's `SUM` does; and
display rounding is explicit (`round`, which goes via the decimal exponent form
so 1.005 does not round down). Preview and file therefore agree bit for bit.

**A failed lookup leaves the cell blank, and the whole pricing block with it.**
Where no list price can be found, columns Y, Z, AA, AB and AC are all left
empty rather than written as formulas. Writing `=+AB/1.12` over a blank AB
yields 0, and a chain of zeros reads as "we sell this for nothing" — the same
distinction CLAUDE.md draws under "A price of zero is not a price". The target
sample instead writes a derived suggestion (`=+X*1.18*1.12*1.8`) into AB for its
`ITEM NUEVO` rows; that is a priced judgement a person made, and generating it
automatically would be inventing a selling price, which the brief forbids.
Column AD is left blank for the same reason.

**Descriptions and list prices come from the Catalog first, the workbook's own
`No tocar` second, and the supplier invoice third.** Every fallback is reported
by name and code, and so is every product resolved by none.

**Internal-use products carry no price on purpose.** A Catalog row with
`internal_use` set, or a `precio_lista` of exactly 0, means the goods are bought
and never sold. Those lines get a blank pricing block and their own warning,
separate from "no list price found", so the two are not confused.

**Product codes are normalised to text everywhere.** Column B, and the matching
column A of the generated `No tocar`, are written as inline strings through
`formatProductCode`. The old sheet writes one code (`2014`) as a **number**
while its `No tocar` holds text — a VLOOKUP across that mismatch returns `#N/A`
on exactly one line of a 31-line sheet. Normalising both sides removes the class
of failure entirely.

**Every product on the sheet is written into the generated `No tocar`.** The
source lookup sheet is copied, then each shipment line overwrites its own row
(matched on digits) or is appended. This is what makes the VLOOKUPs
unconditionally resolvable, and it keeps the file self-contained.

**Formulas are written with their computed values alongside.** openpyxl writes
formulas with no cached value, and CLAUDE.md records what that costs here: this
platform's readers take the cache, so such a file comes back as a sheet of
blanks. Writing `<f>` and `<v>` together means the file is correct to anything
that opens it before its first recalculation.

**Saved into File Storage as `liquidacion`.** `order_files.doc_type` has a check
constraint allowing `liquidacion | proforma | packing_list | bl | barcodes |
other`; there is no `costo`. Adding one is a schema migration, which the brief
put out of scope. `liquidacion` is the closest existing tag and the generated
file name (`LIQUIDACION COSTO CHS 09.xlsx`) makes it unambiguous. Saving is an
explicit button with an order selector, not automatic — it puts a document in
front of the whole team.

**`1.12` in column AA is carried over deliberately.** `=+AB12/1.12` is what the
target workbook writes and what this series has written for years, even though
ITBIS is 18%. Changing it would silently reprice a whole shipment against the
file this is meant to reproduce. It is `PRICE_INC_TAX_DIVISOR` in
`costSheetModel.js` if it is ever corrected as a deliberate act.

**A warning the brief did not list: derived CIF drift.** The old sheet's CIF
PESOS was pasted in from the declaration; the new format derives it from
FOB + freight + insurance × rate. When the two disagree, every duty and ITBIS
figure on the converted sheet differs from what was actually paid. On CHS 09
with the DGII rate and CUENTA T's freight this is a 19% gap. Hiding it would be
exactly the silent failure the brief exists to prevent, so it is a warning
naming both figures and their difference.

---

## Sheets in the generated workbook

`No tocar` (the lookup, self-contained), `CONTENEDOR 1` (the cost sheet), and
`NOTAS` (how the file was produced: the four decisions, the source files, and
every accepted warning with its product codes).

`Gráfico1`, `Gráfico2`, `Hoja1`, `CUENTA T` and `REGISTRO` are **not**
reproduced. `REGISTRO` in both samples is full of `#REF!` and must never be
propagated. `CUENTA T` could only be half-written — its local-expense rows are
plain links to `CONTENEDOR 1`, but its initial/completive/gravamen figures are
not knowable from the inputs, and a half-empty account sheet is worse than none.

---

## What was verified, and what was not

Checked against the real sample files:

- **38 automated acceptance checks** covering format detection, line count and
  sequential numbering, the column identities (`H = E+F+G`, `I = H × rate`,
  `V = SUM(N:U)`, `W = V/C`), the three reconciling totals, all four decision
  controls, blocking and clearing, grouped warnings, and the generated file.
- **Every formula in the generated workbook evaluated independently in Python**
  (cell references, `SUM`, `VLOOKUP`, absolute refs) and compared to the cached
  value written beside it: **707 formulas, 0 mismatches**, including all 31
  text-returning VLOOKUPs.
- **The file produced by the browser** — not only by Node — was saved to disk and
  put through the same evaluation, plus opened with openpyxl: 0 error cells.
- The whole interface driven end to end in a browser: upload, the readiness
  summary, filling the missing expense to clear the block, accepting warnings to
  enable the download, each of the four controls visibly moving the preview,
  download, and saving against the order.
- Rejection paths: the Milan 11 file is reported as already converted; the
  supplier invoice — which also heads a column `Codigo` beside `Descripcion` — is
  rejected as not a cost sheet; neither crashes.
- The document-scroll invariant holds at 1440, 982 (a real PC at 125% scaling)
  and 375 px: the document never scrolls, the page container does, and the
  31-column table scrolls inside its own box.
- EN/ES key parity: 988 keys each, 0 missing either way; all 120 dynamically
  built keys resolved in both bundles.
- `npm run build` passes.

**Not verified:** the file has **not** been opened in Excel or LibreOffice.
Neither is installed on this machine, so "recalculating the downloaded file
produces the same numbers as the on-screen preview" is supported by the
independent formula evaluation described above rather than by an actual
recalculation. That is the one acceptance criterion not closed by direct
observation, and it is worth opening the first generated file in Excel to
confirm.

## Not implemented

**Inline editing of a missing value from inside the findings panel.** The brief
asked for findings to be "actionable in place where possible". Every blocking
finding names the field it belongs to and every one of those fields is editable
in the form directly above the panel, which recomputes on each keystroke — but
there is no input inside the finding row itself. Adding one would need each
finding to carry a writable reference to its form field (the shipment-level ones
already effectively do, via `field`; the per-product ones — a list price for one
of eleven named codes — would need a per-product override map, which
`prepareLines` already accepts as `overrides` but nothing currently populates).

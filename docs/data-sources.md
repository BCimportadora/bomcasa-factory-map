# Data sources — how product data is extracted from each document type

Status: **draft.** The product-code and join questions that previously blocked this spec are
now **resolved with hard evidence** — the two sample documents describe the same shipment and
join 16/16. Remaining open items are in [Unresolved questions](#unresolved-questions).

This file describes *what the documents contain and how to read them*. It deliberately
specifies no schema, no tables and no code.

## The samples this spec was written against

| Document | File | Verified |
|---|---|---|
| A — DGA liquidación de impuestos | `Milan 11 arancel.pdf` | 17 line items, all totals reconciled |
| B — Supplier proforma invoice | `BARCODE CODIGOS DE BARRA MILAN 11.xlsx` | 16 product rows, 16 barcodes |
| C — Internal cost liquidation *(see note)* | `LIQUIDACION COSTO MILANLUX ORDEN 11.xlsx` | consulted as evidence only |

Documents A and B are the **same consignment**: 16 of 16 product codes join, quantities match
exactly, and FOB unit prices agree to the cent. See
[Cross-document linkage](#cross-document-linkage).

> **A superseded file.** An earlier file at the same path as Document A was a *different*
> declaration — 45 lines of KOLNY switches and outlets, B/L `NBOCSS26060320`, arrived
> 07/08/2026 — and was identified as the wrong document for Milan 11. It has been replaced
> and can no longer be re-read. It is cited in two places below where it contributed a
> genuine format observation that this sample cannot show (duplicate codes within one
> declaration, and pagination across four pages). Those observations are flagged where they
> appear, and **none of its figures are used as Milan 11 values**.

> **Path note.** The brief said the samples are in `docs/samples/`. They are not — all three
> are in `C:\Users\compr\Documents\`. I read them from there and did **not** copy them into
> the repository. Two reasons: the scope of this task was a single file, and these workbooks
> carry supplier unit pricing and a 3,627-row master cost list. Committing them would put
> that in git history permanently, and the repo already carries a standing rule against
> leaving customer spreadsheets in the tree. If you want them versioned, say so and we will
> do it deliberately — ideally somewhere private, not `docs/`.

> **Document C was not requested but proved decisive.** The brief said no cost sheet had been
> provided yet. One had — earlier in this project, and it is still on disk. Its first sheet
> (`No tocar`) is a 3,627-row master article list, and it is what allowed the product-code
> question to be answered from evidence. It is described here only that far; it needs its own
> spec pass.

---

## Document Type A — DGA Liquidación de Impuestos (PDF)

**What it is.** "Reporte de Liquidación de Impuestos", issued by the Dirección General de
Aduanas through the SIGA system. It is the customs authority's assessment of a specific import
declaration. **This is the source of tariff data.** It is authoritative for duty rates and for
what customs believes was imported; it is not a commercial document and carries no barcodes.

**Sample:** 2 pages, 17 line items, declaración `10150-IC01-2607-003862 (1.01)`,
manifest detail `BOMBILLA LED`.

### Header fields

All header fields sit on page 1 above the line-item table.

| Field | Sample value |
|---|---|
| Declaración | `10150-IC01-2607-003862 (1.01)` |
| Liquidación | `10150-CL11-2607-003B9A (1.00)` |
| Fecha Decl. | `29/07/2026` |
| Fecha Llegada | `23/07/2026` |
| Consignatario | `BOMCASA IMPORTADORA SA` |
| Importador | `BOMCASA IMPORTADORA SA` |
| Manifiesto | `IGMM2026071394` |
| Número B/L | `SNZCSS26050640` |
| Agencia | `LYN CARGO EXPRESS S R L` |
| Régimen | `DESPACHO A CONSUMO` |
| Estado | `Inspeccionada` |
| Depósito de Destino | `[DOCAU] CAUCEDO` |
| Documento | `101734825` |
| DETALLE DEL MANIFIESTO | `BOMBILLA LED` |

**Detection.** Do *not* parse the header line-by-line as `key : value`. The header is laid out
in **three columns**, and the reading order interleaves them. Two failures observed on the real
file:

- `Endosado` is empty, so a line-based parser reads the *next* column's text as its value (it
  returned `Adm : ADMINISTRACION PUERTO`).
- `Depósito de Destino` appears twice, once wrapped, so a naive parser records a phantom field
  called `Destino`.

Read header fields by **x-position band**, the same way the line table is read, or match each
label explicitly and take only the text to its right within the same column band.

### Line-item table — geometry

The table has 12 columns. Only the *header row* is ruled; the body rows have no ruling at all,
so `find_tables()`-style detection finds the header and nothing else. Column boundaries come
from the ruled header cells. **They were byte-identical across both observed declarations**, so
they appear to be a fixed property of the SIGA report rather than of one file — but read them
from the ruled header on each import rather than hard-coding them.

| # | Column | x-range (pt) |
|---|---|---|
| 0 | ITEM | 34.92 – 60.60 |
| 1 | ARANCEL | 60.60 – 102.00 |
| 2 | DESCRIPCION | 102.00 – 191.40 |
| 3 | UNID. | 191.40 – 225.60 |
| 4 | ORIGEN | 225.60 – 261.60 |
| 5 | CANT. | 261.60 – 306.60 |
| 6 | FOB | 306.60 – 340.20 |
| 7 | CIF | 340.20 – 386.40 |
| 8 | GRAVAMEN | 386.40 – 435.60 |
| 9 | SELECTIVO | 435.60 – 484.80 |
| 10 | ITBIS | 484.80 – 525.60 |
| 11 | TOTAL | 525.60 – 577.05 |

Assign each extracted word to a column by the **x-centre** of its bounding box.

Body region: below y=301.5 on page 1, from the top of the frame on later pages. The bottom
bound is **the y of the word `Totales`**, not a fixed margin — see hazards.

### Line-item table — row delimitation

**This is the part that silently corrupts data if done wrong.**

The ITEM number and every numeric column are **vertically centred** within their row. The
DESCRIPCION cell wraps from the **top** of the row. So on a 3-line description the item number
sits beside line 2, and on a 4-line description it sits between lines 2 and 3. **The item
number is therefore not on the first description line and cannot be used to delimit rows.**

A parser that starts a new record whenever it sees an ITEM number produces rows whose numbers
are all correct and whose descriptions are shifted by one line — so every total still
reconciles while the product codes silently belong to the wrong products. This was reproduced
during analysis: a row came out as `KOLNY/BLANCO (10/1) 340205 NO APLICA DIMMER DE BOMBILLO`,
having lost its own first line and absorbed the next row's.

**Correct rule.** Delimit rows by the vertical gap in the DESCRIPCION column, which is strictly
bimodal:

| Gap | Meaning | This sample | Superseded sample |
|---|---|---|---|
| `9.6 pt` | line leading *within* a row | 50 | 139 |
| `13.2 pt` | padding *between* rows | 15 | 41 |

Split description lines into blocks wherever the gap exceeds the midpoint of those two modes,
then zip the blocks against the numeric anchors in document order. Derive the threshold from
the observed gaps rather than hard-coding `13.2`, and assert that the block count equals the
anchor count on every page.

Cross-check: large gaps + page count = row count. Here 15 + 2 = 17, matching the highest ITEM
number. (On the superseded 4-page file: 41 + 4 = 45.)

### Column mapping

| Source column | Target field | Type | Unit / currency |
|---|---|---|---|
| ITEM | line number | integer | — |
| ARANCEL | tariff code (partida arancelaria) | string `NNNN.NN.NN` | — |
| DESCRIPCION | description + embedded product code | string | — |
| UNID. | unit of measure | string | `Unidades` throughout the sample |
| ORIGEN | country of origin | string | `CHINA` throughout the sample |
| CANT. | quantity | decimal | units |
| FOB | **FOB unit price** | decimal(2) | **USD** |
| CIF | **line total** | decimal(2) | **DOP** |
| GRAVAMEN | duty **amount** | decimal(2) | DOP |
| SELECTIVO | excise **amount** | decimal(2) | DOP |
| ITBIS | VAT **amount** | decimal(2) | DOP |
| TOTAL | line tax total | decimal(2) | DOP |

Confirmed against the proforma: FOB is a unit price and CIF is a line total, in different
currencies. Do not treat the pair as comparable.

### Extraction rule — product code from DESCRIPCION

The internal product code is embedded in the description text.

**Rule: strip a trailing `NO APLICA` if present, then take the last standalone 6-digit run.
A row may legitimately have no code.**

Regex: `(?<!\d)(\d{6})(?!\d)`.

Verified 17/17 on this sample, and the code is the **only** 6-digit run on every row — no
dimension or packing figure ever collides (`60/108MM`, `(25/1)`, `(50)` and `(100)` all fail
the "exactly six digits" test).

**Two corrections to the brief.**

*`NO APLICA` is not a reliable anchor.* The rule was described as "the last standalone 6-digit
number appearing before `NO APLICA`". **Item 4 has no `NO APLICA` at all** — its description
ends `…KOLNY(10/1)(100) 591224`. Treat `NO APLICA` as an optional trailing marker to strip, not
as a required terminator. A parser that requires it returns nothing for that row.

*Packing notation is not a reliable anchor either.* The described pattern was "description,
then packing notation like `(10/1)` or `(6/1)(60)`, then a 6-digit code". On the superseded
sample, 5 of 45 rows had **no packing notation at all**, and 10 distinct notation shapes
occurred including `(10)/100` and `(100/1)`. Do not require it.

**Rows can have no product code, and some of those are not catalog products.** Item 17 is
`LED PANEL DRIVERS NO APLICA` — no code, arancel `8504.10.00`, 90 units at US$0.45. This is a
real line, not a parse failure.

**Confirmed: these drivers are spares for internal use, not catalog products.** They must be
imported as a shipment line — the units, CIF and duty are real and belong in the landed-cost
total — but must not create a catalog product.

**Do not use "has no code" as the classifier.** It is the weakest of the available signals and
this sample gives only one instance of it. The liquidación PDF alone cannot tell you a line is
internal; it just omits the code. The authoritative marker is in the cost sheet (Document C),
which carries all three of:

| Signal | Value on this line | Strength |
|---|---|---|
| `COMENTARIO` column (AE) | `USO INTERNO` | **authoritative** — an explicit human marking |
| `Codigo` column (B) | `8000-01` | strong — the catch-all code, also used for POLYBAG on the superseded declaration, and listed in the master as `PRODUCTO PARA VENTAS DIRECTAS` |
| Sale price / precio de lista | `0` | corroborating — see the standing rule that a price of zero is not a price |

Note that the cost sheet **does** assign this line a code (`8000-01`) where the DGA description
omits it entirely. So the two documents disagree about whether the line has a code, and the cost
sheet is the more complete record.

Practical rule for a liquidación importer: a line with no code is **not** an error and **not**
automatically internal — import it as a shipment line and flag it. Classification comes from the
cost sheet once that is spec'd.

Note also that the code prefix varies and carries no meaning you can rely on: this sample runs
`5911xx`/`5912xx`/`5915xx`; the superseded one ran `3300xx`/`34xxxx`/`8000xx`.

### Extraction rule — gravamen percentage

```
gravamen_pct = GRAVAMEN / CIF * 100      # round to 2 dp; guard CIF = 0
```

Verified. Rates are exact and constant per ARANCEL across the document:

| ARANCEL | Goods | Rows | Derived rate |
|---|---|---|---|
| `8539.52.00` | LED lamps | 4 | **0.00 %** |
| `9405.41.90` | LED luminaires / panels | 12 | **20.00 %** |
| `8504.10.00` | LED drivers | 1 | **0.00 %** |

Use per-ARANCEL consistency as a validation check and flag any ARANCEL that produces more than
one distinct rate. A disagreement indicates a mis-parsed row rather than a real rate change.

*(For reference, the superseded declaration yielded `8536.50.90` → 0 %, `8536.69.20` → 14 %,
`8536.90.90` → 14 %, `8531.80.00` → 3 %, `3923.21.90` → 20 %. Rates are a property of the
arancel code, so these remain valid observations of the same mechanism.)*

### Page-break rows

The brief flagged rows at page boundaries as mangled — the previous row's TOTAL fusing with a
split item number, e.g. `2058.752` + `98536.50.90`.

**That corruption does not occur with position-based extraction.** It is an artefact of
reading-order text extraction, where the page boundary is not a hard break. Reading words with
their coordinates, page by page, the boundary is hard and rows come out intact.

On this sample the boundary falls between items 10 and 11, and both parse cleanly:

| Field | Item 10 (last on page 1) | Item 11 (first on page 2) |
|---|---|---|
| ARANCEL | `9405.41.90` | `9405.41.90` |
| DESCRIPCION | `PANEL LED EMPOTRABLE CUADRADADO KOLNY 12W (40/1) 591513 NO APLICA` | `PANEL LED EMPOSTRABLE CUADRADO 15W 591514 NO APLICA` |
| product code | `591513` | `591514` |
| CANT. | 1,200.00 | 2,500.00 |
| FOB (unit) | US$ 1.52 | US$ 1.92 |
| CIF | RD$ 124,180.58 | RD$ 326,785.89 |
| GRAVAMEN | RD$ 24,836.12 | RD$ 65,357.18 |
| ITBIS | RD$ 26,823.01 | RD$ 70,585.75 |
| TOTAL | RD$ 51,659.13 | RD$ 135,942.93 |
| derived gravamen_pct | 20.00 % | 20.00 % |

### Known hazards

| Hazard | Reality | Handling |
|---|---|---|
| **Row delimitation by item number** | Item number is vertically centred; description is top-aligned | Delimit on the DESCRIPCION column gap; assert block count = anchor count per page |
| **Page-break row fusion** | Only affects reading-order extraction | Extract per page with coordinates; the page boundary is then a hard break |
| **Bottom margin cutoff** | On the superseded 4-page file a row sat at y≈740; a `y < 720` cutoff dropped it *silently* | Bound the body at the y of the word `Totales`, never a fixed margin |
| **Trailing tables** | Pages carry `FURGONES` and `VEHICULOS` tables whose first column holds `1` | Stopping at `Totales` excludes them; also require the ITEM cell to be the only value on its line |
| **`NO APLICA` absent** | Item 4 has none | Strip it if present; never require it |
| **Row with no product code** | Item 17, `LED PANEL DRIVERS` — spares for internal use, confirmed | Legitimate. Import as a shipment line, do not create a catalog product, do not fail. Classify from the cost sheet's `COMENTARIO` / `8000-01`, never from the missing code alone |
| **Words run together** | **Not reproduced.** Two independent engines (PyMuPDF, pdfminer) both preserve intra-line spaces | Join *wrapped* description lines with a space. The reported `INTERRUPTORSENCILLO` comes from concatenating wrapped lines with no separator — a consumer bug, not a defect in the text layer. Do not build word re-segmentation |
| **Duplicate product codes** | Not present in this sample, but real: the superseded declaration carried `340150` on items 2 and 43, and `340210` on items 13 and 44 | A document is a list of *lines*, not of products — never key line storage on the code |
| **Printed exchange rate is rounded** | Printed `58.55`; true rate `58.5456` across all four RD$/US$ pairs | Capture `58.55` as printed, but derive the effective rate from a RD$/US$ pair if you need to reconstruct figures |

### Validation checks

Run all of these on every import; any failure should block the import rather than warn.

| Check | Expected (this sample) | Result |
|---|---|---|
| Row count = highest ITEM | 17 | ✅ 17 |
| Item numbers contiguous 1..N | 1–17, no gaps | ✅ |
| Σ CIF = Totales row | 2,968,175.27 | ✅ 2,968,175.28 (1¢) |
| Σ GRAVAMEN = Totales row | 519,131.94 | ✅ exact |
| Σ SELECTIVO = Totales row | 0.00 | ✅ exact |
| Σ ITBIS = Totales row | 627,715.33 | ✅ exact |
| Σ TOTAL = Totales row | 1,146,847.27 | ✅ exact |
| Σ (CANT × FOB) ≈ footer Total FOB US$ | 43,557.23 | ⚠️ computed 43,572.10, diff 14.87 |
| gravamen_pct constant per ARANCEL | 3 codes | ✅ |
| TOTAL = GRAVAMEN + SELECTIVO + ITBIS | all rows | ✅ 17/17 exact |
| Rows yielding a 6-digit code | 16 of 17 (item 17 has none) | ✅ expected |

Tolerances:

- **CIF / GRAVAMEN / ITBIS / TOTAL: 5 centavos.** These are exact sums; anything larger is a
  parse failure.
- **FOB: loose — roughly 0.5 % of the total, not centavos.** The 14.87 difference is rounding,
  not a parse error: FOB is printed to 2 dp and quantities reach 4,800 units, so the worst-case
  rounding error here is `Σ CANT × 0.005 = 175.05`. The observed 14.87 is well inside that.
  **Do not tighten this check** — it will fail on correct data.

**Footer figures to capture:** exchange rate `RD$ US$(58.55)`, Total FOB
(RD$ 2,550,084.40 / US$ 43,557.23), Seguro (6,515.54 / 111.29), Flete (411,575.57 / 7,030.00),
Total CIF (2,968,175.51 / 50,698.52), Total Impuestos a Pagar (1,146,847.27), Peso Bruto
8,440.85 kg / Peso Neto 8,440.84 kg, container (`MSDU4119810`, `CONTENEDOR 40 PIES HIGH CUBE`).

**Expected reconciliation quirk — do not "fix" it.** The footer `Total CIF` (2,968,175.51)
exceeds the `Totales` row (2,968,175.27) by 0.24, explained exactly by the footer line
`Total Monto Liberado del CIF: $0.24`. The same 0.24 explains the only row where ITBIS is not
18 % of (CIF + GRAVAMEN + SELECTIVO): item 17 shows 496.81 where the printed CIF implies 496.77,
and `0.24 × 0.18 = 0.04` closes the gap. Both are consistent, not errors. *(The same pattern
held on the superseded file, with a liberado of 1.82 and gaps of 1.81 and 0.33.)*

---

## Document Type B — Supplier Proforma Invoice (Excel)

**What it is.** A commercial proforma invoice issued by the supplier — here
`SHANGHAI MILANLUX LIGHTING CO., LTD`, invoice `ML26101`, dated `Mar 30, 2026`, marked
`Order 11`. **This is the source of barcodes.** It carries no tariff data.

**Sample:** one sheet, `ORDER 11`, range `A1:P27`, 16 product rows.

### Header detection

The real header is **not row 1** and is **two rows deep** (rows 9 and 10 in this sample).
Rows 1–8 carry supplier name and address, the title `PROFORMA INVOICE`, invoice number, date,
order reference and buyer address.

Row 9 holds merged group headers spanning row 10's sub-headers:

| Group header (row 9) | Spans | Sub-headers (row 10) |
|---|---|---|
| `Description of Goods` | F:G | `English`, `Spanish` |
| `QUANTITY` | H:J | `Q'TY`, `PCS/CTN`, `CTNS` |
| `FOB PRICE` | K:L | `UNIT PRICE`, `AMOUNT` |
| `VOLUME` | M:N | `CBM/CTN`, `VOL(m3)` |
| `GROSS WEIGHT` | O:P | `G.W`, `Total` |

Columns A–E are single cells merged vertically across rows 9:10 (`Photos`, `No.`, `Code`,
`Barcode missing`, `Model`).

**Do not hardcode row 9.** Detect it. The most robust signal available in this file is the
**merge structure**: find the first row whose cells are merged vertically across two rows *and*
horizontally into groups. A simpler and adequate fallback: scan downward for the first row
containing a cell whose normalised text is `No.` in a column immediately left of a column whose
text is `Code`; the data then starts two rows below.

Data rows run from the row after the sub-header row until the TOTAL row.

### Column mapping

| Col | Source header | Target field | Type | Unit / currency |
|---|---|---|---|---|
| A | `Photos` | product image | embedded image | see hazards |
| B | `No.` | line number | integer | — |
| C | `Code` | internal article code | string `NNNN-NN` | — |
| D | `Barcode missing` | **barcode** | string, 13 digits | EAN-13 |
| E | `Model` | supplier model | string | — |
| F | `Description of Goods → English` | description (EN) | string | — |
| G | `Description of Goods → Spanish` | description (ES) | string | — |
| H | `QUANTITY → Q'TY` | quantity | integer | units |
| I | `QUANTITY → PCS/CTN` | pieces per carton | integer | units |
| J | `QUANTITY → CTNS` | cartons | integer | — |
| K | `FOB PRICE → UNIT PRICE` | **FOB unit price** | decimal | **USD** |
| L | `FOB PRICE → AMOUNT` | line amount | decimal | USD |
| M | `VOLUME → CBM/CTN` | volume per carton | decimal | m³ |
| N | `VOLUME → VOL(m3)` | line volume | decimal | m³ |
| O | `GROSS WEIGHT → G.W` | gross weight per carton | decimal | kg |
| P | `GROSS WEIGHT → Total` | line gross weight | decimal | kg |

### Barcode column

The header text literally reads **`Barcode missing`**. Confirmed in the sample. Locate the
column by position (immediately after `Code`) and by content — its values are 13-digit EAN
numbers — not by its label.

**Cleaning:** strip all non-digits, then require exactly 13 digits.

**Result on the sample: all 16 clean to 13 digits and all 16 pass the EAN-13 check digit.**
Formatting defects found:

- Row 16 (`5915-04`): trailing double-quote — `7467241315004"`
- Rows 17, 19, 21, 23, 25, 26: trailing space — e.g. `7468501377060 `

Barcodes are stored as **shared strings (text)**, not numbers, so leading zeros survive. Two GS1
prefixes appear: `746724…` (9 codes) and `746850…` (7 codes). All 16 are unique.

Keep the EAN-13 check-digit test as a hard validation — it caught nothing here, which is exactly
what makes it cheap insurance for the next file.

### Known hazards

| Hazard | Reality | Handling |
|---|---|---|
| **Header row position** | Row 9/10, not row 1 | Detect via merge structure or the `No.` / `Code` pair |
| **Two-deep header** | Group headers merged over sub-headers | Compose the field name from both rows, or map by sub-header where present and group header otherwise |
| **`Barcode missing` label** | It *is* the barcode column | Locate by position + 13-digit content |
| **Barcode whitespace / stray quote** | 7 of 16 rows affected | `re.sub(r'\D', '', value)` then require `len == 13` |
| **Binary float noise** | Raw XML stores `0.28499999999999998` for a UNIT PRICE of 0.285; `AMOUNT` shows `1145.6999999999998` | Parse to `Decimal` via the shortest round-trip repr (`Decimal(str(v))`), not `Decimal(float)`. Keep full precision in storage; round only for display |
| **TOTAL row** | Row 27, `B27 = 'TOTAL:1X40GP'`, merged B:G | Exclude. Detect by the `No.` cell not being an integer, not by row index |
| **Computed cells** | `AMOUNT`, and every TOTAL-row figure, are formulas (`H11*K11`, `SUM(L11:L26)`) | Read cached values (`data_only=True`). If a file is ever written by a non-Excel tool the cache may be absent and these read as `None` — treat that as a hard failure, and recompute `AMOUNT` as `Q'TY × UNIT PRICE` |
| **Product images** | 7 embedded images; one is the letterhead logo anchored at row 0, 6 are product photos anchored to rows | Match images to rows by anchor row. Only 6 photos exist for 16 products — do not assume one per row |

### Validation checks

| Check | Expected (this sample) | Result |
|---|---|---|
| Product rows extracted | 16 | ✅ |
| TOTAL row excluded | row 27 | ✅ |
| Every barcode = 13 digits after cleaning | 16/16 | ✅ |
| Every barcode passes EAN-13 check digit | 16/16 | ✅ |
| Barcodes unique within document | 16 unique | ✅ |
| Σ Q'TY = TOTAL row | 34,920 | ✅ exact |
| Σ CTNS = TOTAL row | 1,302 | ✅ exact |
| Σ AMOUNT = TOTAL row | 43,557.10 | ✅ exact |
| Σ G.W Total = TOTAL row | 9,688.30 | ✅ exact |
| AMOUNT = Q'TY × UNIT PRICE per row | all rows | ✅ 16/16 |

---

## Cross-document linkage

### The product-code formats are the same system — confirmed

The brief flagged the two code formats as an incompatible discrepancy. **They are not
incompatible: they are the same codes with the hyphen removed.**

The rule is `NNNNNN` → `NNNN-NN` — insert a hyphen before the last two digits.

Confirmed on **two independent declarations**:

- This sample: 16 of 17 lines carry a code; **16 of 16 resolve** against the proforma and the
  master article list. (The 17th, LED drivers, carries no code.)
- The superseded switches declaration: **45 of 45** resolved against the master article list,
  with 44 of 45 descriptions matching word for word.

The split point is unambiguous: of 3,565 six-digit flattened forms in the master article list,
**zero** admit more than one valid `N-N` split. The master is overwhelmingly `NNNN-NN` (3,565 of
3,627).

### Documents A and B are the same shipment

Every product line joins, and the figures agree independently:

| DGA item | code | → proforma | PDF qty | Proforma qty | PDF FOB | Proforma FOB | barcode |
|---|---|---|---|---|---|---|---|
| 1 | `591103` | `5911-03` | 4,020 | 4,020 | 0.28 | 0.285 | 7467241313383 |
| 2 | `591104` | `5911-04` | 3,000 | 3,000 | 0.34 | 0.345 | 7467241313406 |
| 3 | `591105` | `5911-05` | 4,800 | 4,800 | 0.45 | 0.448 | 7467241313420 |
| 4 | `591224` | `5912-24` | 2,000 | 2,000 | 0.55 | 0.55 | 7467241314861 |
| 5 | `591503` | `5915-03` | 1,200 | 1,200 | 1.28 | 1.28 | 7467241314991 |
| 6 | `591504` | `5915-04` | 2,100 | 2,100 | 1.42 | 1.42 | 7467241315004 |
| 7 | `591505` | `5915-05` | 2,500 | 2,500 | 1.68 | 1.68 | 7468501377060 |
| 8 | `591506` | `5915-06` | 1,500 | 1,500 | 1.72 | 1.72 | 7467241315011 |
| 9 | `591507` | `5915-07` | 1,200 | 1,200 | 2.85 | 2.85 | 7468501377077 |
| 10 | `591513` | `5915-13` | 1,200 | 1,200 | 1.52 | 1.52 | 7467241315028 |
| 11 | `591514` | `5915-14` | 2,500 | 2,500 | 1.92 | 1.92 | 7468501377084 |
| 12 | `591515` | `5915-15` | 1,200 | 1,200 | 1.98 | 1.98 | 7467241315035 |
| 13 | `591516` | `5915-16` | 1,200 | 1,200 | 2.99 | 2.99 | 7468501377091 |
| 14 | `591522` | `5915-22` | 1,500 | 1,500 | 1.38 | 1.38 | 7467241315042 |
| 15 | `591525` | `5915-25` | 2,500 | 2,500 | 1.62 | 1.62 | 7468501377107 |
| 16 | `591526` | `5915-26` | 2,500 | 2,500 | 1.88 | 1.88 | 7468501377114 |
| 17 | *(none)* | — | 90 | — | 0.45 | — | `LED PANEL DRIVERS` |

- **16/16 codes join**; no proforma code lacks a PDF line and no coded PDF line lacks a
  proforma row.
- **16/16 quantities match exactly.**
- **16/16 FOB unit prices agree within one cent** — the PDF rounds to 2 dp, the proforma carries
  3 (`0.285` → `0.28`).
- **Totals agree:** PDF footer Total FOB US$ 43,557.23 vs proforma Σ AMOUNT US$ 43,557.10.
- **Unit counts reconcile exactly:** PDF 35,010 − proforma 34,920 = **90**, the uncoded LED
  drivers line. That line is absent from the proforma because it is not a sold product — it is
  spares for internal use, marked `USO INTERNO` in the cost sheet. The proforma covering only
  catalog goods is therefore expected, not a gap.

Document C's cost workbook carries the same US$ 43,557.10 FOB total, so all three files describe
one consignment.

**The join key is the normalised article code**, not the barcode. Barcodes exist only on the
proforma; the liquidación never carries one.

**Consequence for the catalog.** Products are the stable entity, keyed on the normalised article
code. Barcodes attach to products. Tariff data (ARANCEL, gravamen rate) attaches to products.
Quantities, FOB prices, CIF and duty amounts attach to a *shipment line*, not to a product — a
single declaration can carry the same code on two lines, and prices differ between shipments.
This is not yet a design; it is the constraint any design has to meet.

---

## Fields not available in either document

Neither sample contains:

- **Unit price in DOP (landed cost).** The DGA PDF gives CIF as a DOP line total and the tax
  amounts, but landed cost also requires freight, customs handling, transport and agent fees.
  Not derivable from either file.
- **Precio de lista actual.** Absent from both.

These come from a separate internal cost sheet. **Document C is very likely that file** — its
`No tocar` sheet carries a DOP figure per article, and its other sheets (`CONTENEDOR 1`,
`CUENTA T`, `REGISTRO`) were not examined. It has not been confirmed as the intended source, and
it needs its own spec pass before anything reads it.

---

## Unresolved questions

**Resolved so far:**

- **Product-code formats.** One system: `NNNNNN` → `NNNN-NN`, confirmed on two declarations.
- **Join key.** The normalised article code, not the barcode. Documents A, B and C are one
  shipment; 16/16 lines join.
- **Uncoded lines.** The LED drivers are spares for internal use, not catalog products. Import
  as a shipment line, do not create a product. Classify from the cost sheet's `COMENTARIO` /
  `8000-01` code, not from the missing code.

No design decision is blocked on these any longer.

Still open:

**1. Edge cases in the article-code format.** The `NNNN-NN` rule is confirmed for every code
observed. The master article list also holds shapes that rule cannot describe:

- 49 plain 4-digit codes and 5 plain 3-digit codes. Real articles, or legacy rows?
- 5 codes in `NNNN-N` form (`3105-0`, `3806-2`, `3900-1`, `3901-2`, `3907-0`). These look
  truncated. Should the importer pad them, or flag them?
- Three keys that look like typos: `3901.03` alongside `3901-03`, and `62.05-01` alongside
  `6205-01` — dots where hyphens belong. Normalise dots to hyphens, or flag?

**2. Are there other internal-use categories, and is `8000-01` the only catch-all code?** The
drivers rule is settled, but the *detection* rule rests on two observations of `8000-01` — spare
drivers here, POLYBAG on the superseded declaration. Is `8000-01` the single code for everything
non-sellable, or are there others (packaging, samples, promotional stock)? And is `USO INTERNO`
the only comment text that means this, or do variants appear? A list would let the importer
classify without guessing.

**3. Should a liquidación line with an unknown code be rejected or accepted?** Every code here
resolves. Tell me what to do when one does not — block the import, or import and flag for
review?

**4. Confirm Document C is the cost source.** If `LIQUIDACION COSTO MILANLUX ORDEN 11.xlsx` is
the source of landed cost and precio de lista, say so and I will spec it. Its `No tocar` sheet
holds a DOP figure per article whose meaning I have not confirmed — and 6 of the 16 articles in
this order have `0` there, which needs an explanation before anything treats it as a price.

**5. Should the sample files be committed?** They are currently outside the repo, and they
contain supplier unit pricing and your full master cost list. My recommendation is to leave them
out of git. Say if you want otherwise.

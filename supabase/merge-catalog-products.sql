-- ---------------------------------------------------------------------------
-- Merge one catalog product into another.
--
-- A one-off data repair, NOT part of schema.sql -- that file is the schema and
-- is re-run in full; this one changes data and runs deliberately.
--
-- Why it exists: a DGA liquidación and our cost sheet can describe the same
-- goods with nothing in common to match on. The spare LED drivers arrive as
-- "LED PANEL DRIVERS" on the declaration, with a partida arancelaria and no
-- product code, and as "DRIVER LED DE REPUESTO" on the cost sheet under
-- 8000-01, with a code and no arancel. English against Spanish -- the importer
-- keeps them apart rather than guessing, and a person joins them here.
--
-- Why it is not a plain DELETE: `catalog_sources` records which documents a
-- product came from, and it cascades. Deleting the losing row throws that away
-- instead of moving it, so the surviving product would forget it was ever on
-- the Milan 11 declaration.
--
-- One DO block on purpose. The Supabase SQL editor goes through a connection
-- pooler, so consecutive statements are not guaranteed to share a session --
-- the same reason merge-duplicate-factories.sql is written this way.
--
-- Set the two codes below, run STEP 1, then STEP 2.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- STEP 1 -- PREVIEW. Writes nothing.
--
-- Shows the two rows so you can see which is which before merging. `keep` is
-- the row that survives; `absorb` is the row that is emptied into it and then
-- removed.
-- ===========================================================================
select
  case when p.code_key = '800001' then 'keep' else 'absorb' end as role,
  p.code_key,
  p.product_code,
  p.description,
  p.arancel,
  p.gravamen_pct,
  p.fob_usd,
  p.unit_price_dop,
  p.precio_lista,
  p.barcode,
  p.doc_ref,
  p.cost_ref,
  (select count(*) from public.catalog_sources s where s.catalog_id = p.id) as documents
from public.catalog p
where p.code_key in ('800001', 'desc:LEDPANELDRIVERS')
order by role desc;


-- ===========================================================================
-- STEP 2 -- THE MERGE. Deletes the absorbed row.
--
-- Every field the surviving row is missing is taken from the absorbed one, so
-- the tariff code the declaration supplied ends up on the coded product. A
-- field both rows hold is left alone: the survivor was chosen for a reason.
-- ===========================================================================
do $$
declare
  keep_code    text := '800001';                -- 8000-01, from the cost sheet
  absorb_code  text := 'desc:LEDPANELDRIVERS';  -- the uncoded declaration row
  keep_id      uuid;
  absorb_id    uuid;
  moved        integer;
begin
  select id into keep_id   from public.catalog where code_key = keep_code;
  select id into absorb_id from public.catalog where code_key = absorb_code;

  if keep_id is null then
    raise notice 'Nothing to do: no product with code_key %', keep_code;
    return;
  end if;
  if absorb_id is null then
    raise notice 'Nothing to do: no product with code_key % (already merged?)', absorb_code;
    return;
  end if;

  -- Fill the survivor's blanks from the row being absorbed.
  update public.catalog k set
    product_code   = coalesce(nullif(k.product_code, ''),   a.product_code),
    description    = coalesce(nullif(k.description, ''),    a.description),
    arancel        = coalesce(nullif(k.arancel, ''),        a.arancel),
    gravamen_pct   = coalesce(k.gravamen_pct,               a.gravamen_pct),
    fob_usd        = coalesce(k.fob_usd,                    a.fob_usd),
    unit_price_dop = coalesce(k.unit_price_dop,             a.unit_price_dop),
    precio_lista   = coalesce(k.precio_lista,               a.precio_lista),
    barcode        = coalesce(nullif(k.barcode, ''),        a.barcode),
    supplier_code  = coalesce(nullif(k.supplier_code, ''),  a.supplier_code),
    model          = coalesce(nullif(k.model, ''),          a.model),
    description_en = coalesce(nullif(k.description_en, ''), a.description_en),
    description_es = coalesce(nullif(k.description_es, ''), a.description_es),
    doc_ref        = coalesce(nullif(k.doc_ref, ''),        a.doc_ref),
    cost_ref       = coalesce(nullif(k.cost_ref, ''),       a.cost_ref),
    doc_date       = coalesce(k.doc_date,                   a.doc_date),
    cost_date      = coalesce(k.cost_date,                  a.cost_date)
  from public.catalog a
  where k.id = keep_id and a.id = absorb_id;

  -- Move the provenance across, skipping any document already recorded against
  -- the survivor -- the pair is the primary key.
  with moved_rows as (
    insert into public.catalog_sources (catalog_id, import_id)
    select keep_id, s.import_id
      from public.catalog_sources s
     where s.catalog_id = absorb_id
       and not exists (
         select 1 from public.catalog_sources t
          where t.catalog_id = keep_id and t.import_id = s.import_id)
    returning 1
  )
  select count(*) into moved from moved_rows;

  delete from public.catalog where id = absorb_id;

  raise notice 'Merged % into %. Documents moved: %', absorb_code, keep_code, moved;
end $$;


-- ===========================================================================
-- STEP 3 -- CONFIRM. Writes nothing.
--
-- One row, with both a code and an arancel, and no uncoded drivers row left.
-- ===========================================================================
select code_key, product_code, description, arancel, unit_price_dop, precio_lista
from public.catalog
where code_key in ('800001', 'desc:LEDPANELDRIVERS')
   or description ilike '%driver%'
order by code_key;

-- ---------------------------------------------------------------------------
-- Give every supplier the nickname people here actually use.
--
-- A one-off data load, NOT part of schema.sql -- that file is the schema and is
-- re-run in full; this one writes data and runs deliberately, once.
--
-- The pairs below come from apodos.xlsx, column "APODO EN LAS ORDENES", with
-- the bracketed order count ("MILAN (7)") dropped -- that is a tally, not part
-- of the name. Three suppliers are all called INNOVACIONES there, so each
-- carries what it brings in brackets to tell them apart, and two suppliers no
-- order has ever named take their own company name.
--
-- Matching is on the LEGAL name reduced to letters and digits, which is what
-- `factoryNameKey` does in the application: "CO., LTD", "CO.,LTD." and the
-- full-width comma in one of these names are all the same company. It is not
-- fuzzy beyond that -- putting a nickname on the wrong supplier would send a
-- container to the wrong place.
--
-- A supplier listed twice, as a plant and a sales office, gets the nickname on
-- both rows. That is correct: they are one company, and `soleOrPlant` in
-- src/lib/factories.js picks the plant when an order reference has to resolve
-- to one of them.
--
-- Run STEP 1, read it, then run STEP 2.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- STEP 1 -- PREVIEW. Writes nothing.
--
-- Every supplier and every proposed nickname, side by side. Read the `action`
-- column: anything saying NO MATCH is a name that differs between the sheet
-- and the database, and needs a person to reconcile it.
-- ===========================================================================
select
  case
    when p.legal_name is null then 'not in the sheet -- left alone'
    when f.id is null then 'NO MATCH -- nothing will be set'
    when f.nickname is not distinct from p.nickname then 'already set'
    else 'will set'
  end                            as action,
  p.nickname                     as new_nickname,
  f.nickname                     as current_nickname,
  coalesce(f.name, p.legal_name) as factory,
  f.location_type,
  f.city
from public.factories f
full outer join (values
  ('FOSHAN ULIVE IMP&EXP CO., LTD'::text, 'Bomsani'::text),
  ('CHANGHONG PLASTICS GROUP IMPERIAL PLASTICS CO.,LTD.', 'CHS'),
  ('Hebei Tianyou International Trade Co., Ltd', 'Gemlaight'),
  ('SHUNDE NATIVE PRODUCE IMPORT AND EXPORT CO.，LTD. OF GUANGDONG', 'PVC'),
  ('DONGGUAN KAIDI ADHESIVE TECHNOLOGY CO., LTD', 'Cintas'),
  ('WANSHIDA TAPE HUBEI CO., LTD', 'Tapes'),
  ('WENZHOU YUEQIU BAKELITE ELECTRIC APPLIANCES CO., LTD', 'Klik'),
  ('FUZHOU POWER ELECTRICAL APPLIANCES CO.,LTD', 'Power'),
  ('FUJIANG MINQING HAOHONG PORCELAIN ELECTRONIC CO., LTD', 'Rosetas'),
  ('WENZHOU MTLC ELECTRIC APPLIANCES CO., LTD', 'MTLC'),
  ('SONGRI ELECTRIC CO., LTD', 'Songri'),
  ('YUEQING HONGJI TRADE CO., LTD', 'Hongji'),
  ('FIMEX TAIWAN LTD', 'Switches Fimex'),
  ('RONG KUANG ELECTRIC CO., LTD.', 'Switches'),
  ('NINGBO HOPE HARDWARE PRODUCTS CO., LTD', 'Hope'),
  ('BEIJING SANI-METAL IMPORT&EXPORT CO., LTD', 'Sani Metal'),
  ('Shanghai Ebasee Electric Co.,Ltd', 'Ebasee'),
  ('SHANGHAI MILANLUX LIGHTING CO., LTD', 'Milan'),
  ('ZHONGSHAN TEAMPOWER COMMERCE & TRADE CO., LTD', 'Llavines'),
  ('JINAN GANGHUA BUSINESS OF SAW CO., LTD', 'Seguetas'),
  ('SHIJIAZHUANG SOTHINK TRADING', 'Tornillos'),
  ('SHIJIAZHUANG SHIQIAO ELECTRIC WELDING MATERIAL CO., LTD', 'Soldadura'),
  ('Guangzhou Veaqee Electronic Co.Ltd', 'Veaqee'),
  ('ZHEJIANG FANGCHENG TOOLS CO.,LTD', 'Barrenas'),
  ('Hangzhou Jinmeng Road Establishment Co., Ltd', 'Tapas'),
  ('Beijing Deyi Diamond Products Co., Ltd.', 'Innovaciones (Disco corta vidrio)'),
  ('DANYANG FELDA TOOLS CO., LTD', 'Innovaciones (Adaptador de taladro)'),
  ('Shenzhen Wochen Industrial Company LTD.', 'Innovaciones (Llave de grifería)'),
  ('LIANYINGANG ORIENTCRAFT ABRASIVES CO., LTD', 'Discos')
) as p(legal_name, nickname)
  on regexp_replace(lower(f.name), '[^a-z0-9]+', '', 'g') = regexp_replace(lower(p.legal_name), '[^a-z0-9]+', '', 'g')
order by action, new_nickname, factory;


-- ===========================================================================
-- STEP 2 -- APPLY.
--
-- One DO block on purpose: the Supabase SQL editor goes through a connection
-- pooler, so consecutive statements are not guaranteed to share a session --
-- the same reason merge-duplicate-factories.sql is written this way.
--
-- Re-runnable. A row already holding its nickname is not rewritten, so running
-- this twice reports 0 the second time rather than churning every row.
-- ===========================================================================
do $$
declare
  changed integer;
begin
  with proposed(legal_name, nickname) as (values
    ('FOSHAN ULIVE IMP&EXP CO., LTD'::text, 'Bomsani'::text),
    ('CHANGHONG PLASTICS GROUP IMPERIAL PLASTICS CO.,LTD.', 'CHS'),
    ('Hebei Tianyou International Trade Co., Ltd', 'Gemlaight'),
    ('SHUNDE NATIVE PRODUCE IMPORT AND EXPORT CO.，LTD. OF GUANGDONG', 'PVC'),
    ('DONGGUAN KAIDI ADHESIVE TECHNOLOGY CO., LTD', 'Cintas'),
    ('WANSHIDA TAPE HUBEI CO., LTD', 'Tapes'),
    ('WENZHOU YUEQIU BAKELITE ELECTRIC APPLIANCES CO., LTD', 'Klik'),
    ('FUZHOU POWER ELECTRICAL APPLIANCES CO.,LTD', 'Power'),
    ('FUJIANG MINQING HAOHONG PORCELAIN ELECTRONIC CO., LTD', 'Rosetas'),
    ('WENZHOU MTLC ELECTRIC APPLIANCES CO., LTD', 'MTLC'),
    ('SONGRI ELECTRIC CO., LTD', 'Songri'),
    ('YUEQING HONGJI TRADE CO., LTD', 'Hongji'),
    ('FIMEX TAIWAN LTD', 'Switches Fimex'),
    ('RONG KUANG ELECTRIC CO., LTD.', 'Switches'),
    ('NINGBO HOPE HARDWARE PRODUCTS CO., LTD', 'Hope'),
    ('BEIJING SANI-METAL IMPORT&EXPORT CO., LTD', 'Sani Metal'),
    ('Shanghai Ebasee Electric Co.,Ltd', 'Ebasee'),
    ('SHANGHAI MILANLUX LIGHTING CO., LTD', 'Milan'),
    ('ZHONGSHAN TEAMPOWER COMMERCE & TRADE CO., LTD', 'Llavines'),
    ('JINAN GANGHUA BUSINESS OF SAW CO., LTD', 'Seguetas'),
    ('SHIJIAZHUANG SOTHINK TRADING', 'Tornillos'),
    ('SHIJIAZHUANG SHIQIAO ELECTRIC WELDING MATERIAL CO., LTD', 'Soldadura'),
    ('Guangzhou Veaqee Electronic Co.Ltd', 'Veaqee'),
    ('ZHEJIANG FANGCHENG TOOLS CO.,LTD', 'Barrenas'),
    ('Hangzhou Jinmeng Road Establishment Co., Ltd', 'Tapas'),
    ('Beijing Deyi Diamond Products Co., Ltd.', 'Innovaciones (Disco corta vidrio)'),
    ('DANYANG FELDA TOOLS CO., LTD', 'Innovaciones (Adaptador de taladro)'),
    ('Shenzhen Wochen Industrial Company LTD.', 'Innovaciones (Llave de grifería)'),
    ('LIANYINGANG ORIENTCRAFT ABRASIVES CO., LTD', 'Discos')
  ),
  applied as (
    update public.factories f
       set nickname = p.nickname
      from proposed p
     where regexp_replace(lower(f.name), '[^a-z0-9]+', '', 'g') = regexp_replace(lower(p.legal_name), '[^a-z0-9]+', '', 'g')
       and f.nickname is distinct from p.nickname
    returning 1
  )
  select count(*) into changed from applied;

  raise notice 'Nicknames set on % supplier row(s).', changed;
end $$;


-- ===========================================================================
-- STEP 3 -- CONFIRM. Writes nothing.
--
-- Every supplier with the name it will now be shown under. A row with a null
-- nickname still reads under its legal name everywhere; it is not broken, it
-- just has no short name yet.
-- ===========================================================================
select
  coalesce(nickname, '(none -- shows its legal name)') as shown_as,
  name,
  location_type,
  city
from public.factories
order by nickname nulls last, name;

-- ---------------------------------------------------------------------------
-- Merge duplicate factory rows.
--
-- A one-off data repair, NOT part of schema.sql -- that file is the schema and
-- is re-run in full; this one changes data and must be run deliberately, once,
-- after reading what it is about to do.
--
-- Why this is not a plain DELETE: two tables point at factories(id), both
-- `on delete set null` --
--
--     orders.factory_id
--     innovation_quotes.factory_id
--
-- so deleting a duplicate silently blanks the supplier on any order or quote
-- attached to it. Both are repointed at the surviving row first.
--
-- Rows are grouped by name AND city, each normalised to letters and digits
-- only, mirroring factoryNameKey() in src/lib/csv.js. Grouping on the name
-- alone would merge two genuinely different plants that a supplier runs in
-- different cities, and as that file already says: merging two different
-- suppliers is far worse than leaving one duplicate.
--
-- Run STEP 1 on its own first. It writes nothing.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- STEP 1 -- PREVIEW. Writes nothing. Read the output before going further.
-- ===========================================================================
with norm as (
  select
    f.id,
    f.name,
    f.city,
    f.created_at,
    trim(regexp_replace(lower(f.name), '[^a-z0-9]+', ' ', 'g')) as name_key,
    trim(regexp_replace(lower(coalesce(f.city, '')), '[^a-z0-9]+', ' ', 'g')) as city_key,
    -- Prefer keeping the row somebody actually filled in.
    ( (f.address        is not null and f.address        <> '')::int
    + (f.city           is not null and f.city           <> '')::int
    + (f.province       is not null and f.province       <> '')::int
    + (f.contact_person is not null and f.contact_person <> '')::int
    + (f.phone          is not null and f.phone          <> '')::int
    + (f.email          is not null and f.email          <> '')::int
    + (f.products       is not null and f.products       <> '')::int
    + (f.capacity       is not null and f.capacity       <> '')::int
    + (f.notes          is not null and f.notes          <> '')::int ) as filled
  from public.factories f
),
grouped as (
  select
    n.*,
    count(*)      over w as group_size,
    first_value(n.id) over (partition by n.name_key, n.city_key
                            order by n.filled desc, n.created_at asc, n.id asc) as keep_id
  from norm n
  window w as (partition by n.name_key, n.city_key)
)
select
  g.name,
  g.city,
  g.group_size                                     as rows_in_group,
  count(*) filter (where g.id <> g.keep_id)        as rows_to_delete,
  (select count(*) from public.orders o
     where o.factory_id in (select id from grouped x
                            where x.name_key = g.name_key and x.city_key = g.city_key
                              and x.id <> x.keep_id))  as orders_to_repoint,
  (select count(*) from public.innovation_quotes q
     where q.factory_id in (select id from grouped x
                            where x.name_key = g.name_key and x.city_key = g.city_key
                              and x.id <> x.keep_id))  as quotes_to_repoint
from grouped g
where g.group_size > 1
group by g.name, g.city, g.group_size, g.name_key, g.city_key
order by g.name;


-- ===========================================================================
-- STEP 1b -- SAME NAME, DIFFERENT CITY. Writes nothing.
--
-- These are NOT merged by step 2, because they may be two real plants. If any
-- of them are in fact duplicates where one row simply has the city missing,
-- fix the city by hand and re-run step 1.
-- ===========================================================================
with norm as (
  select id, name, city,
         trim(regexp_replace(lower(name), '[^a-z0-9]+', ' ', 'g')) as name_key
  from public.factories
)
select name_key,
       count(*)                            as rows,
       array_agg(distinct coalesce(city, '(no city)')) as cities
from norm
group by name_key
having count(distinct coalesce(city, '')) > 1
order by name_key;


-- ===========================================================================
-- STEP 2 -- THE MERGE. This deletes rows. Run step 1 first.
--
-- One DO block on purpose, not a BEGIN/COMMIT script with a temp table.
-- Supabase's SQL Editor goes through a connection pooler, so consecutive
-- statements are not guaranteed to land on the same session -- a temp table
-- created by one statement then does not exist for the next, which fails with
-- `relation "factory_merge" does not exist`. A DO block runs server-side as a
-- single statement, so the whole merge shares one session and one transaction:
-- either all of it happens or none of it does.
--
-- Set dry_run to true to see the counts without changing anything. It raises
-- at the end, which rolls the whole block back.
--
-- Counts come back as notices, under "Messages"/"Notices" rather than as a
-- result grid. Step 3 confirms the outcome independently.
-- ===========================================================================
do $$
declare
  dry_run    boolean := false;   -- <= true to preview and roll back
  n_groups   integer;
  n_delete   integer;
  n_orders   integer;
  n_quotes   integer;
  n_filled   integer;
  stragglers integer;
begin
  -- Who survives each duplicate group, and who goes.
  create temporary table factory_merge on commit drop as
  with norm as (
    select
      f.id,
      f.created_at,
      trim(regexp_replace(lower(f.name), '[^a-z0-9]+', ' ', 'g')) as name_key,
      trim(regexp_replace(lower(coalesce(f.city, '')), '[^a-z0-9]+', ' ', 'g')) as city_key,
      -- Prefer keeping the row somebody actually filled in.
      ( (f.address        is not null and f.address        <> '')::int
      + (f.city           is not null and f.city           <> '')::int
      + (f.province       is not null and f.province       <> '')::int
      + (f.contact_person is not null and f.contact_person <> '')::int
      + (f.phone          is not null and f.phone          <> '')::int
      + (f.email          is not null and f.email          <> '')::int
      + (f.products       is not null and f.products       <> '')::int
      + (f.capacity       is not null and f.capacity       <> '')::int
      + (f.notes          is not null and f.notes          <> '')::int ) as filled
    from public.factories f
  )
  select
    n.id as dup_id,
    first_value(n.id) over (partition by n.name_key, n.city_key
                            order by n.filled desc, n.created_at asc, n.id asc) as keep_id
  from norm n;

  select count(distinct keep_id) into n_groups from factory_merge where dup_id <> keep_id;
  delete from factory_merge where dup_id = keep_id;
  select count(*) into n_delete from factory_merge;

  if n_delete = 0 then
    raise notice 'No duplicates found. Nothing to do.';
    return;
  end if;

  -- Fill any blank on the survivor from a duplicate that has it, so merging
  -- never loses a phone number or an address somebody typed on the other row.
  with updated as (
    update public.factories k set
      address        = coalesce(nullif(k.address, ''),        d.address),
      province       = coalesce(nullif(k.province, ''),       d.province),
      contact_person = coalesce(nullif(k.contact_person, ''), d.contact_person),
      phone          = coalesce(nullif(k.phone, ''),          d.phone),
      email          = coalesce(nullif(k.email, ''),          d.email),
      products       = coalesce(nullif(k.products, ''),       d.products),
      capacity       = coalesce(nullif(k.capacity, ''),       d.capacity),
      notes          = coalesce(nullif(k.notes, ''),          d.notes)
    from factory_merge m
    join public.factories d on d.id = m.dup_id
    where k.id = m.keep_id
    returning 1
  )
  select count(*) into n_filled from updated;

  -- Repoint BEFORE deleting. Both columns are `on delete set null`, so the
  -- other order would silently blank the supplier instead of moving it.
  with moved as (
    update public.orders o set factory_id = m.keep_id
      from factory_merge m
     where o.factory_id = m.dup_id
    returning 1
  )
  select count(*) into n_orders from moved;

  with moved as (
    update public.innovation_quotes q set factory_id = m.keep_id
      from factory_merge m
     where q.factory_id = m.dup_id
    returning 1
  )
  select count(*) into n_quotes from moved;

  -- Nothing should point at a duplicate by now; stop if anything still does.
  select count(*) into stragglers
    from public.orders o join factory_merge m on o.factory_id = m.dup_id;
  if stragglers > 0 then
    raise exception 'orders still reference % duplicate factories', stragglers;
  end if;

  select count(*) into stragglers
    from public.innovation_quotes q join factory_merge m on q.factory_id = m.dup_id;
  if stragglers > 0 then
    raise exception 'quotes still reference % duplicate factories', stragglers;
  end if;

  delete from public.factories f using factory_merge m where f.id = m.dup_id;

  raise notice 'duplicate groups merged: %', n_groups;
  raise notice 'factory rows deleted:    %', n_delete;
  raise notice 'survivors given a missing field: %', n_filled;
  raise notice 'orders repointed:        %', n_orders;
  raise notice 'quotes repointed:        %', n_quotes;

  if dry_run then
    raise exception 'DRY RUN -- rolled back, nothing was changed';
  end if;
end $$;

-- ===========================================================================
-- STEP 3 -- CONFIRM. Writes nothing. Should return no rows.
-- ===========================================================================
with norm as (
  select name, city,
         trim(regexp_replace(lower(name), '[^a-z0-9]+', ' ', 'g')) as name_key,
         trim(regexp_replace(lower(coalesce(city, '')), '[^a-z0-9]+', ' ', 'g')) as city_key
  from public.factories
)
select name, city, count(*) as still_duplicated
from norm
group by name, city, name_key, city_key
having count(*) > 1
order by name;

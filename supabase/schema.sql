-- Bomcasa platform — database schema
--
-- This file is IDEMPOTENT: run it on a fresh project, or re-run it on an
-- existing project to apply the latest changes. Paste it into the Supabase
-- SQL editor and run.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user (identity, role and department)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'business_user' check (role in ('admin', 'business_user')),
  created_at timestamptz not null default now()
);

-- Columns added after the first release; safe to re-run.
alter table public.profiles add column if not exists first_name text;
alter table public.profiles add column if not exists last_name text;
alter table public.profiles add column if not exists department text;
alter table public.profiles add column if not exists language text not null default 'en';
-- Appearance preference. 'system' follows the device, and is the default so a
-- new account inherits whatever the machine is already set to.
alter table public.profiles add column if not exists theme text not null default 'system';
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_department_check') then
    alter table public.profiles add constraint profiles_department_check
      check (department is null or department in ('sales', 'rnd_purchasing', 'administration', 'accounting'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_language_check') then
    alter table public.profiles add constraint profiles_language_check
      check (language in ('en', 'es'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_theme_check') then
    alter table public.profiles add constraint profiles_theme_check
      check (theme in ('light', 'dark', 'system'));
  end if;
end $$;

create index if not exists profiles_role_idx on public.profiles(role);
create index if not exists profiles_department_idx on public.profiles(department);

alter table public.profiles enable row level security;

-- ---------------------------------------------------------------------------
-- Authorisation helper. SECURITY DEFINER so it can read profiles from inside a
-- policy on profiles without recursing through RLS.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer stable set search_path = public;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- profiles policies
--
-- SELECT: any signed-in user may read the directory (names, department, role).
--         Anonymous visitors get nothing.
-- UPDATE: a user may edit their own row; admins may edit any row. Which
--         *columns* may change is enforced by the trigger below, because RLS
--         alone cannot compare NEW.role against OLD.role.
-- INSERT: no policy — rows are created only by the handle_new_user trigger.
-- DELETE: no policy — accounts are removed via auth.users (service role).
-- ---------------------------------------------------------------------------
drop policy if exists "Users can view their own profile" on public.profiles;
drop policy if exists "Authenticated users can view the directory" on public.profiles;
create policy "Authenticated users can view the directory"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "Users update their own profile, admins update any" on public.profiles;
create policy "Users update their own profile, admins update any"
  on public.profiles for update
  to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- Privilege-escalation guard.
--
-- Without this, any signed-in user could call
--   update profiles set role = 'admin' where id = <their own id>
-- directly against PostgREST and promote themselves, because the RLS policy
-- above legitimately allows them to update their own row.
--
-- auth.uid() is NULL for service-role requests (the account-creation Edge
-- Function) and in the SQL editor, which is how an administrator is bootstrapped.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_profile_update_rules()
returns trigger as $$
begin
  if new.id is distinct from old.id then
    raise exception 'profiles.id is immutable';
  end if;

  if new.role is distinct from old.role then
    if auth.uid() is not null and not public.is_admin() then
      raise exception 'Only administrators can change a role';
    end if;
  end if;

  -- email mirrors auth.users; never let it be edited through the API
  if auth.uid() is not null and new.email is distinct from old.email then
    new.email := old.email;
  end if;

  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists profiles_enforce_update_rules on public.profiles;
create trigger profiles_enforce_update_rules
  before update on public.profiles
  for each row execute procedure public.enforce_profile_update_rules();

-- ---------------------------------------------------------------------------
-- New auth users get a profile row. Names/department are copied from the
-- metadata supplied by the account-creation Edge Function.
--
-- role is deliberately NOT read from user metadata: metadata is attacker
-- controlled on a self-service signup, so it must never decide privileges.
-- Everyone starts as business_user; the Edge Function promotes with the
-- service role afterwards.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, first_name, last_name, department)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'first_name', ''),
    nullif(new.raw_user_meta_data ->> 'last_name', ''),
    nullif(new.raw_user_meta_data ->> 'department', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Backfill profiles for any users created before this trigger existed.
insert into public.profiles (id, email)
select u.id, u.email from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

-- ---------------------------------------------------------------------------
-- factories (unchanged behaviour: admins see all, business users see their own)
-- ---------------------------------------------------------------------------
create table if not exists public.factories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  city text,
  province text,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  contact_person text,
  phone text,
  products text,
  capacity text,
  notes text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Added after the first release; safe to re-run.
alter table public.factories add column if not exists email text;
-- Not every pin is a plant: some suppliers publish only an office, and one is a
-- warehouse beside a port. Defaulting to 'factory' keeps existing rows correct.
alter table public.factories add column if not exists location_type text not null default 'factory';

-- What people here actually call this supplier: "Milan" for Shanghai Milanlux.
--
-- `name` stays the identity -- it is the legal name, it goes on paperwork, and
-- the CSV import matches on it. The nickname is a display alias, so it is
-- nullable and carries no constraint: a supplier nobody has shortened simply
-- reads under its full name. Two suppliers sharing a nickname is not rejected
-- here either; the code that resolves one requires a unique match and gives up
-- rather than guessing, which is the safer place for that rule to live.
alter table public.factories add column if not exists nickname text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'factories_location_type_check') then
    alter table public.factories add constraint factories_location_type_check
      check (location_type in ('factory', 'office', 'warehouse'));
  end if;
end $$;

create index if not exists factories_created_by_idx on public.factories(created_by);
create index if not exists factories_province_idx on public.factories(province);
create index if not exists factories_city_idx on public.factories(city);

alter table public.factories enable row level security;

-- Every signed-in user can read the whole factory list: the directory of
-- suppliers is shared company knowledge. Creating and editing stay restricted
-- to the owner (or an admin) by the policies below.
drop policy if exists "Admins see all factories, business users see their own" on public.factories;
drop policy if exists "Authenticated users can view all factories" on public.factories;
create policy "Authenticated users can view all factories"
  on public.factories for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users insert their own factories" on public.factories;
create policy "Authenticated users insert their own factories"
  on public.factories for insert
  to authenticated
  with check (created_by = auth.uid());

drop policy if exists "Admins update all, business users update their own" on public.factories;
create policy "Admins update all, business users update their own"
  on public.factories for update
  to authenticated
  using (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());

drop policy if exists "Admins delete all, business users delete their own" on public.factories;
create policy "Admins delete all, business users delete their own"
  on public.factories for delete
  to authenticated
  using (created_by = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- orders and order_items
--
-- One order is one purchase from one factory, and it moves through a single
-- lifecycle: draft -> confirmed -> in_production -> ready -> shipped -> arrived.
-- The two menu sections are two filtered views of this one table, so an order
-- that ships is never re-typed: its status changes and it moves across.
--
-- Line items live in their own table because a proforma invoice carries several
-- products at different prices, and the totals have to add up across them.
-- ---------------------------------------------------------------------------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null,
  factory_id uuid references public.factories(id) on delete set null,
  status text not null default 'draft',
  currency text not null default 'USD',
  -- Matches an id in src/lib/ports.js. Deliberately not a foreign key: the port
  -- list is fixed reference data compiled into the bundle, not a table anyone
  -- edits, so there is nothing to point at.
  fob_port text,
  order_date date,
  ready_date date,
  etd date,
  eta date,
  container_no text,
  bl_number text,
  notes text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_status_check') then
    alter table public.orders add constraint orders_status_check
      check (status in ('draft', 'confirmed', 'in_production', 'ready', 'shipped', 'arrived', 'cancelled'));
  end if;
end $$;

create index if not exists orders_status_idx on public.orders(status);
create index if not exists orders_factory_id_idx on public.orders(factory_id);
create index if not exists orders_created_by_idx on public.orders(created_by);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product text not null,
  quantity numeric(14, 3),
  unit text not null default 'pcs',
  unit_price numeric(14, 4),
  -- Preserves the order the lines were typed in. Without it PostgREST returns
  -- them in whatever order Postgres happens to find them, which can differ
  -- between two reads of the same unchanged order.
  line_no integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists order_items_order_id_idx on public.order_items(order_id);

-- Keeps updated_at honest without every caller having to remember it.
create or replace function public.touch_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists orders_touch_updated_at on public.orders;
create trigger orders_touch_updated_at
  before update on public.orders
  for each row execute procedure public.touch_updated_at();

alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- Same model as factories: the order book is shared company knowledge, so any
-- signed-in user can read it, but editing stays with whoever entered the order
-- (or an administrator).
drop policy if exists "Authenticated users can view all orders" on public.orders;
create policy "Authenticated users can view all orders"
  on public.orders for select to authenticated using (true);

drop policy if exists "Authenticated users insert their own orders" on public.orders;
create policy "Authenticated users insert their own orders"
  on public.orders for insert to authenticated with check (created_by = auth.uid());

drop policy if exists "Admins update all orders, business users their own" on public.orders;
create policy "Admins update all orders, business users their own"
  on public.orders for update to authenticated
  using (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());

drop policy if exists "Admins delete all orders, business users their own" on public.orders;
create policy "Admins delete all orders, business users their own"
  on public.orders for delete to authenticated
  using (created_by = auth.uid() or public.is_admin());

-- Line items carry no permissions of their own: whether a line may be touched
-- is decided entirely by the order it hangs off. SECURITY DEFINER so the check
-- reads orders directly rather than through the policies above, which is both
-- cheaper and immune to a later change in how orders are read.
create or replace function public.can_edit_order(target_order uuid)
returns boolean as $$
  select exists (
    select 1 from public.orders o
    where o.id = target_order and (o.created_by = auth.uid() or public.is_admin())
  );
$$ language sql security definer stable set search_path = public;

revoke all on function public.can_edit_order(uuid) from public;
grant execute on function public.can_edit_order(uuid) to authenticated;

drop policy if exists "Authenticated users can view all order items" on public.order_items;
create policy "Authenticated users can view all order items"
  on public.order_items for select to authenticated using (true);

drop policy if exists "Order items follow their order (insert)" on public.order_items;
create policy "Order items follow their order (insert)"
  on public.order_items for insert to authenticated
  with check (public.can_edit_order(order_id));

drop policy if exists "Order items follow their order (update)" on public.order_items;
create policy "Order items follow their order (update)"
  on public.order_items for update to authenticated
  using (public.can_edit_order(order_id))
  with check (public.can_edit_order(order_id));

drop policy if exists "Order items follow their order (delete)" on public.order_items;
create policy "Order items follow their order (delete)"
  on public.order_items for delete to authenticated
  using (public.can_edit_order(order_id));

-- ---------------------------------------------------------------------------
-- Landed cost (liquidacion de costo)
--
-- A liquidation is produced per container after it arrives: it spreads the
-- freight, insurance, duties and local charges across the order lines and
-- arrives at a cost per unit and a selling price. It belongs to the order it
-- settles, so these columns extend orders rather than forming a second table.
--
-- The headline figures are real columns because they are what gets read, sorted
-- and totalled. The rest of the sheet -- twenty-odd charge components that
-- differ between shipments and will gain new ones -- lives in a jsonb blob, so
-- a spreadsheet that grows a column does not need a migration.
-- ---------------------------------------------------------------------------
alter table public.orders add column if not exists landed_currency text not null default 'DOP';
alter table public.orders add column if not exists landed_total numeric(16, 4);
alter table public.orders add column if not exists landed_units numeric(14, 3);
-- Where the figures came from: file name, sheet, who imported it and when.
-- Without this an unexpected number has no provenance to check.
alter table public.orders add column if not exists liquidation jsonb;

alter table public.order_items add column if not exists product_code text;
alter table public.order_items add column if not exists units_received numeric(14, 3);
alter table public.order_items add column if not exists fob_total numeric(14, 4);
alter table public.order_items add column if not exists landed_total numeric(16, 4);
alter table public.order_items add column if not exists landed_unit_cost numeric(14, 4);
alter table public.order_items add column if not exists sale_price numeric(14, 4);
alter table public.order_items add column if not exists list_price numeric(14, 4);
alter table public.order_items add column if not exists line_comment text;
-- Every remaining column of the sheet, keyed by the importer's field names.
alter table public.order_items add column if not exists cost_breakdown jsonb;

create index if not exists order_items_product_code_idx on public.order_items(product_code);

-- ---------------------------------------------------------------------------
-- innovations (R&D)
--
-- One table, two sections, exactly like orders. `label` is the working tag that
-- anyone may set; `stage` is the promotion, and only an administrator may move
-- it. They are separate columns on purpose: an item can sit at label 'done' for
-- days before someone with the authority actually promotes it, and collapsing
-- the two would make the promotion happen by accident.
-- ---------------------------------------------------------------------------
create table if not exists public.innovations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  label text not null default 'need_to_present',
  stage text not null default 'development',
  -- Who is carrying the item forward. Distinct from created_by: the person who
  -- had the idea is often not the person chasing the quotes.
  assigned_to uuid references auth.users(id) on delete set null,
  local_price numeric(14, 2),
  local_currency text not null default 'USD',
  local_price_notes text,
  -- Only meaningful once promoted, but kept on the same row so that promoting
  -- an item does not mean copying it into a second table.
  fob_price numeric(14, 4),
  fob_currency text not null default 'USD',
  planned_units numeric(14, 0),
  notes text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'innovations_label_check') then
    alter table public.innovations add constraint innovations_label_check
      check (label in ('need_to_present', 'to_do', 'checking', 'got_supplier',
                       'got_quote', 'ready_to_present', 'done', 'denied'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'innovations_stage_check') then
    alter table public.innovations add constraint innovations_stage_check
      check (stage in ('development', 'ready'));
  end if;
end $$;

create index if not exists innovations_stage_idx on public.innovations(stage);
create index if not exists innovations_label_idx on public.innovations(label);
create index if not exists innovations_created_by_idx on public.innovations(created_by);
create index if not exists innovations_assigned_to_idx on public.innovations(assigned_to);

-- Images live in Storage; this table only records which object belongs to which
-- innovation, and in what order they should be shown.
create table if not exists public.innovation_images (
  id uuid primary key default gen_random_uuid(),
  innovation_id uuid not null references public.innovations(id) on delete cascade,
  storage_path text not null,
  line_no integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists innovation_images_innovation_idx
  on public.innovation_images(innovation_id);

-- A single innovation report can cover several sizes or a bundle (a 4 1/2 inch
-- and a 7 inch disc quoted together), so quotes hang off a variation.
create table if not exists public.innovation_variations (
  id uuid primary key default gen_random_uuid(),
  innovation_id uuid not null references public.innovations(id) on delete cascade,
  name text not null,
  notes text,
  line_no integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists innovation_variations_innovation_idx
  on public.innovation_variations(innovation_id);

create table if not exists public.innovation_quotes (
  id uuid primary key default gen_random_uuid(),
  innovation_id uuid not null references public.innovations(id) on delete cascade,
  -- Null means the quote covers the whole item rather than one variation, which
  -- is the normal case before anyone has split it into sizes.
  variation_id uuid references public.innovation_variations(id) on delete cascade,
  factory_id uuid references public.factories(id) on delete set null,
  -- Whether we consider this supplier safe to deal with. 'unknown' is the
  -- honest default: an unchecked factory must not read as an approved one.
  safety text not null default 'unknown',
  quoted_price numeric(14, 4),
  currency text not null default 'USD',
  notes text,
  line_no integer not null default 0,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'innovation_quotes_safety_check') then
    alter table public.innovation_quotes add constraint innovation_quotes_safety_check
      check (safety in ('unknown', 'safe', 'unsafe'));
  end if;
end $$;

create index if not exists innovation_quotes_innovation_idx
  on public.innovation_quotes(innovation_id);
create index if not exists innovation_quotes_variation_idx
  on public.innovation_quotes(variation_id);

drop trigger if exists innovations_touch_updated_at on public.innovations;
create trigger innovations_touch_updated_at
  before update on public.innovations
  for each row execute procedure public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Promotion guard.
--
-- Moving an item into the "ready to order" section is an administrator's
-- decision, and it is only allowed once the item is actually finished. Hiding
-- the button is not enough: the anon key is public, so any signed-in user can
-- PATCH this column directly. Same reasoning as the role guard on profiles.
--
-- auth.uid() is NULL in the SQL editor and for service-role requests, which is
-- what leaves an administrator a way in from the dashboard.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_innovation_update_rules()
returns trigger as $$
begin
  if new.stage is distinct from old.stage then
    if auth.uid() is not null and not public.is_admin() then
      raise exception 'Only administrators can move an innovation between sections';
    end if;
    if new.stage = 'ready' and old.label <> 'done' and new.label <> 'done' then
      raise exception 'An innovation must be labelled done before it can be moved';
    end if;
  end if;

  new.created_by := old.created_by;
  new.created_at := old.created_at;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists innovations_enforce_update_rules on public.innovations;
create trigger innovations_enforce_update_rules
  before update on public.innovations
  for each row execute procedure public.enforce_innovation_update_rules();

alter table public.innovations enable row level security;
alter table public.innovation_images enable row level security;
alter table public.innovation_variations enable row level security;
alter table public.innovation_quotes enable row level security;

-- R&D is collaborative: anyone signed in may add an item and may edit any item,
-- because the person chasing a quote is usually not the person who added it.
-- The one column that is not open is `stage`, guarded by the trigger above.
drop policy if exists "Authenticated users can view innovations" on public.innovations;
create policy "Authenticated users can view innovations"
  on public.innovations for select to authenticated using (true);

drop policy if exists "Any signed-in user can add an innovation" on public.innovations;
create policy "Any signed-in user can add an innovation"
  on public.innovations for insert to authenticated with check (created_by = auth.uid());

drop policy if exists "Any signed-in user can edit an innovation" on public.innovations;
create policy "Any signed-in user can edit an innovation"
  on public.innovations for update to authenticated using (true) with check (true);

-- Deleting is not collaborative: it destroys someone else's work.
drop policy if exists "Owners and admins delete innovations" on public.innovations;
create policy "Owners and admins delete innovations"
  on public.innovations for delete to authenticated
  using (created_by = auth.uid() or public.is_admin());

-- The child tables follow the parent: anyone who may edit the innovation may
-- edit its images, variations and quotes. The function exists so that the four
-- policies below do not each re-state the rule.
create or replace function public.can_edit_innovation(target uuid)
returns boolean as $$
  select exists (select 1 from public.innovations i where i.id = target);
$$ language sql security definer stable set search_path = public;

revoke all on function public.can_edit_innovation(uuid) from public;
grant execute on function public.can_edit_innovation(uuid) to authenticated;

drop policy if exists "View innovation images" on public.innovation_images;
create policy "View innovation images"
  on public.innovation_images for select to authenticated using (true);

drop policy if exists "Insert innovation images" on public.innovation_images;
create policy "Insert innovation images"
  on public.innovation_images for insert to authenticated
  with check (public.can_edit_innovation(innovation_id));

drop policy if exists "Update innovation images" on public.innovation_images;
create policy "Update innovation images"
  on public.innovation_images for update to authenticated
  using (public.can_edit_innovation(innovation_id))
  with check (public.can_edit_innovation(innovation_id));

drop policy if exists "Delete innovation images" on public.innovation_images;
create policy "Delete innovation images"
  on public.innovation_images for delete to authenticated
  using (public.can_edit_innovation(innovation_id));

drop policy if exists "View innovation variations" on public.innovation_variations;
create policy "View innovation variations"
  on public.innovation_variations for select to authenticated using (true);

drop policy if exists "Insert innovation variations" on public.innovation_variations;
create policy "Insert innovation variations"
  on public.innovation_variations for insert to authenticated
  with check (public.can_edit_innovation(innovation_id));

drop policy if exists "Update innovation variations" on public.innovation_variations;
create policy "Update innovation variations"
  on public.innovation_variations for update to authenticated
  using (public.can_edit_innovation(innovation_id))
  with check (public.can_edit_innovation(innovation_id));

drop policy if exists "Delete innovation variations" on public.innovation_variations;
create policy "Delete innovation variations"
  on public.innovation_variations for delete to authenticated
  using (public.can_edit_innovation(innovation_id));

drop policy if exists "View innovation quotes" on public.innovation_quotes;
create policy "View innovation quotes"
  on public.innovation_quotes for select to authenticated using (true);

drop policy if exists "Insert innovation quotes" on public.innovation_quotes;
create policy "Insert innovation quotes"
  on public.innovation_quotes for insert to authenticated
  with check (public.can_edit_innovation(innovation_id));

drop policy if exists "Update innovation quotes" on public.innovation_quotes;
create policy "Update innovation quotes"
  on public.innovation_quotes for update to authenticated
  using (public.can_edit_innovation(innovation_id))
  with check (public.can_edit_innovation(innovation_id));

drop policy if exists "Delete innovation quotes" on public.innovation_quotes;
create policy "Delete innovation quotes"
  on public.innovation_quotes for delete to authenticated
  using (public.can_edit_innovation(innovation_id));

-- ---------------------------------------------------------------------------
-- Storage for innovation images.
--
-- The bucket is PRIVATE. A public bucket serves every object to anyone who has
-- or guesses the URL, with no sign-in at all, and these are unreleased product
-- designs. The application reads them through short-lived signed URLs instead.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('innovations', 'innovations', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Authenticated users read innovation images" on storage.objects;
create policy "Authenticated users read innovation images"
  on storage.objects for select to authenticated
  using (bucket_id = 'innovations');

drop policy if exists "Authenticated users upload innovation images" on storage.objects;
create policy "Authenticated users upload innovation images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'innovations');

drop policy if exists "Uploaders and admins delete innovation images" on storage.objects;
create policy "Uploaders and admins delete innovation images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'innovations' and (owner = auth.uid() or public.is_admin()));

-- ---------------------------------------------------------------------------
-- suggestions (ideas and requests for this platform)
--
-- The smallest section: one table, no children. Anyone signed in may post, and
-- may correct their own wording afterwards. Deciding what happens to a
-- suggestion is a different thing from making one, so `status` is guarded the
-- same way `innovations.stage` is -- otherwise anybody could mark their own
-- request Done and it would drop off the list.
-- ---------------------------------------------------------------------------
create table if not exists public.suggestions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  status text not null default 'new',
  -- Filled in when an administrator declines or completes something, so the
  -- person who asked can see why rather than watching it go quiet.
  response text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'suggestions_status_check') then
    alter table public.suggestions add constraint suggestions_status_check
      check (status in ('new', 'planned', 'in_progress', 'done', 'declined'));
  end if;
end $$;

create index if not exists suggestions_status_idx on public.suggestions(status);
create index if not exists suggestions_created_by_idx on public.suggestions(created_by);

drop trigger if exists suggestions_touch_updated_at on public.suggestions;
create trigger suggestions_touch_updated_at
  before update on public.suggestions
  for each row execute procedure public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Same reasoning as the innovation promotion guard: hiding the control is not
-- enough, because the anon key is public and PostgREST would take the PATCH
-- straight from the browser.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_suggestion_update_rules()
returns trigger as $$
begin
  if new.status is distinct from old.status or new.response is distinct from old.response then
    if auth.uid() is not null and not public.is_admin() then
      raise exception 'Only administrators can decide on a suggestion';
    end if;
  end if;

  new.created_by := old.created_by;
  new.created_at := old.created_at;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists suggestions_enforce_update_rules on public.suggestions;
create trigger suggestions_enforce_update_rules
  before update on public.suggestions
  for each row execute procedure public.enforce_suggestion_update_rules();

alter table public.suggestions enable row level security;

drop policy if exists "Authenticated users can view suggestions" on public.suggestions;
create policy "Authenticated users can view suggestions"
  on public.suggestions for select to authenticated using (true);

drop policy if exists "Any signed-in user can post a suggestion" on public.suggestions;
create policy "Any signed-in user can post a suggestion"
  on public.suggestions for insert to authenticated
  with check (created_by = auth.uid());

-- Authors may reword their own; administrators may edit any, and are the only
-- ones the trigger above lets touch status or response.
drop policy if exists "Authors and admins edit suggestions" on public.suggestions;
create policy "Authors and admins edit suggestions"
  on public.suggestions for update to authenticated
  using (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());

drop policy if exists "Authors and admins delete suggestions" on public.suggestions;
create policy "Authors and admins delete suggestions"
  on public.suggestions for delete to authenticated
  using (created_by = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- order_files (import paperwork attached to an order)
--
-- One row per uploaded document, hanging off the existing orders table. There
-- is deliberately no supplier or order table here: the Files section is a view
-- over factories -> orders -> files, not a parallel data model.
--
-- `storage_path` is the collision-safe key inside the bucket; `file_name` is
-- what the person uploading called it, kept separately because two people will
-- upload `packing list.pdf` on the same order and neither may overwrite the
-- other. Downloads re-attach `file_name`, so the original name comes back.
--
-- `doc_type` is a plain label for filtering. Nothing parses the file to derive
-- it, and nothing should: these documents feed the catalog importer later and
-- must stay byte-identical to what the customs agent or supplier sent.
-- ---------------------------------------------------------------------------
create table if not exists public.order_files (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  doc_type text not null default 'other'
    check (doc_type in ('liquidacion', 'proforma', 'packing_list', 'bl', 'barcodes', 'other')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Every listing in this section is "the files for one order", and the order
-- detail modal asks the same question.
create index if not exists order_files_order_id_idx on public.order_files (order_id);

alter table public.order_files enable row level security;

drop policy if exists "Authenticated users can view all order files" on public.order_files;
create policy "Authenticated users can view all order files"
  on public.order_files for select to authenticated using (true);

drop policy if exists "Authenticated users attach their own order files" on public.order_files;
create policy "Authenticated users attach their own order files"
  on public.order_files for insert to authenticated
  with check (created_by = auth.uid());

-- Matches the rule used for factories and orders: you may remove what you
-- added, an administrator may remove anything.
drop policy if exists "Uploaders and admins delete order files" on public.order_files;
create policy "Uploaders and admins delete order files"
  on public.order_files for delete to authenticated
  using (created_by = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- Storage for order paperwork.
--
-- A SECOND bucket rather than reusing `innovations`: that one is images only at
-- 10MB and holds unreleased product designs. Widening it to accept 25MB
-- spreadsheets would put customs paperwork and confidential designs under one
-- set of policies, and a mistake in either would expose the other.
--
-- PRIVATE, like `innovations` -- a public bucket serves every object to anyone
-- who guesses the URL, and these carry supplier pricing and B/L numbers. The
-- application reads them through short-lived signed URLs.
--
-- The MIME allowlist is enforced against the content type sent on upload. The
-- client sends a canonical type derived from the file extension rather than the
-- browser's guess, because browsers report .xlsx as application/octet-stream
-- and .csv as application/vnd.ms-excel often enough that trusting the guess
-- makes uploads fail at random. See src/lib/orderFiles.js.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('order-files', 'order-files', false, 26214400,
        array['application/pdf',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'application/vnd.ms-excel',
              'text/csv',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'image/jpeg',
              'image/png'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Authenticated users read order files" on storage.objects;
create policy "Authenticated users read order files"
  on storage.objects for select to authenticated
  using (bucket_id = 'order-files');

drop policy if exists "Authenticated users upload order files" on storage.objects;
create policy "Authenticated users upload order files"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'order-files');

drop policy if exists "Uploaders and admins delete order files" on storage.objects;
create policy "Uploaders and admins delete order files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'order-files' and (owner = auth.uid() or public.is_admin()));

-- ---------------------------------------------------------------------------
-- catalog (the master product list)
--
-- Built from the documents an import actually travels on: the DGA liquidación
-- supplies our code, the description, the FOB unit price, the partida
-- arancelaria and the duty rate; the supplier's proforma supplies the barcode
-- and the supplier's own code and model. Both are read, neither is trusted to
-- overwrite the other.
--
-- `code_key` is the deduplication key: the product code reduced to its digits.
-- The same article is written `591503` on a liquidación and `5915-03` on a
-- proforma, and the master list carries dots where hyphens belong in a few
-- rows -- all of which are one product. Storing the key alongside the code as
-- written means a lookup never has to guess, and the unique constraint makes a
-- duplicate impossible rather than merely unlikely.
--
-- `unit_price_dop` and `precio_lista` exist and stay null. They come from the
-- internal cost sheet, which has not been specified yet; a column that is
-- there and empty is honest, a column invented later is a migration.
-- ---------------------------------------------------------------------------
create table if not exists public.catalog (
  id uuid primary key default gen_random_uuid(),
  -- The code as the document wrote it, kept for display.
  product_code text not null,
  -- Digits only. The actual identity of the product.
  code_key text not null unique,
  description text,
  -- Amounts are stored exactly as extracted. Nothing here is converted: the
  -- exchange rate on a liquidación is recorded against the import, not applied.
  fob_usd numeric(14, 4),
  arancel text,
  gravamen_pct numeric(6, 2),
  barcode text,
  -- From the proforma: the supplier's own identifiers, which are not ours.
  supplier_code text,
  model text,
  description_en text,
  description_es text,
  -- From the internal cost sheet. Not populated yet -- see the note above.
  unit_price_dop numeric(14, 4),
  precio_lista numeric(14, 4),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Which document last set each group of values, by the DOCUMENT's own date.
--
-- Orders are not imported in the order they happened: Milan 10's paperwork can
-- arrive after Milan 11's. Without a date to compare, the importer can only
-- choose between refusing to overwrite (leaving stale prices) and overwriting
-- blindly (letting an old order undo a new one). With it, the newest document
-- wins and an older one still fills in blanks.
--
-- Two columns because the two sources are independent: a liquidación or
-- proforma sets `doc_date`, an internal cost sheet sets `cost_date`, and a new
-- liquidación must not block an older cost sheet's peso figures.
-- ...and WHICH order it came from, because a date is not always enough.
--
-- Orders run in a numbered series, and the number is what says which pricing is
-- current: Milan 11 supersedes Milan 10, which supersedes Milan 9. A
-- liquidación for an earlier order can be filed later, and a cost sheet carries
-- no date of its own at all, so the reference decides first and the date is the
-- fallback for documents from different series.
-- Some liquidación lines carry no product code at all -- spare drivers, and the
-- rechargeable bulbs on Milan 10. They still classify goods under a partida
-- arancelaria, which is worth keeping, so they are stored with the code left
-- empty rather than dropped or given an invented one. `code_key` still
-- identifies them, from their description.
alter table public.catalog alter column product_code drop not null;

alter table public.catalog add column if not exists doc_ref text;
alter table public.catalog add column if not exists cost_ref text;
alter table public.catalog_imports add column if not exists doc_ref text;

alter table public.catalog add column if not exists doc_date date;
alter table public.catalog add column if not exists cost_date date;

-- Goods we buy but never sell: spare drivers, packaging, samples.
--
-- They belong in the catalog -- they carry a partida arancelaria and a real
-- landed cost -- but they have no selling price, and the cost sheet says so by
-- writing 0 in the PRECIO VENTA and PRECIO LISTA columns with USO INTERNO in
-- COMENTARIO. Storing that 0 as `precio_lista` would put "we sell this for
-- nothing" into the catalog, so the fact is recorded here and the price is left
-- null.
--
-- Nullable with no default on purpose. Null means no cost sheet has said either
-- way, which is what the importer's fill-a-blank guard tests for; a default of
-- false would assert that every product introduced by a liquidación is sold.
alter table public.catalog add column if not exists internal_use boolean;

-- The list searches on all three of these, and `code_key` already has a unique
-- index from the constraint above.
create index if not exists catalog_barcode_idx on public.catalog (barcode);
create index if not exists catalog_arancel_idx on public.catalog (arancel);

drop trigger if exists catalog_touch_updated_at on public.catalog;
create trigger catalog_touch_updated_at
  before update on public.catalog
  for each row execute procedure public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- catalog_imports (one row per document read)
--
-- `doc_key` is what stops the same document being imported twice: the
-- declaración number for a liquidación, the invoice number for a proforma. It
-- is unique, so a second attempt fails in the database rather than relying on
-- the application to have checked.
--
-- `exchange_rate` is captured because the liquidación footer states it, as a
-- pesos-per-dollar figure, and it belongs with the document. It is deliberately
-- never used to convert anything: the printed rate is rounded to two decimals, and USD and DOP
-- figures are both stored as they were extracted.
-- ---------------------------------------------------------------------------
create table if not exists public.catalog_imports (
  id uuid primary key default gen_random_uuid(),
  doc_type text not null check (doc_type in ('liquidacion', 'proforma', 'costo')),
  doc_key text not null unique,
  file_name text not null,
  -- Liquidación identifiers.
  declaracion text,
  liquidacion text,
  -- Proforma identifier.
  invoice_no text,
  exchange_rate numeric(12, 4),
  line_count integer,
  -- What the import did: added, updated, skipped, failed rows with reasons.
  summary jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- catalog_sources (which documents a product came from)
--
-- Many-to-many on purpose: a product is normally created by a liquidación and
-- then enriched with a barcode by a proforma, and both facts are worth keeping.
-- ---------------------------------------------------------------------------
create table if not exists public.catalog_sources (
  catalog_id uuid not null references public.catalog(id) on delete cascade,
  import_id uuid not null references public.catalog_imports(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (catalog_id, import_id)
);

-- The internal cost sheet joined later, and the table is already deployed.
alter table public.catalog_imports drop constraint if exists catalog_imports_doc_type_check;
alter table public.catalog_imports add constraint catalog_imports_doc_type_check
  check (doc_type in ('liquidacion', 'proforma', 'costo'));
alter table public.catalog_imports add column if not exists doc_date date;

create index if not exists catalog_sources_import_idx on public.catalog_sources (import_id);

-- ---------------------------------------------------------------------------
-- catalog policies
--
-- The catalog is shared reference data rather than anybody's own rows, so any
-- signed-in user may read it, add to it and correct it. Deleting is left to
-- administrators: a product removed by accident takes its prices and its
-- provenance with it, and re-importing will not bring back a hand-typed field.
-- ---------------------------------------------------------------------------
alter table public.catalog enable row level security;
alter table public.catalog_imports enable row level security;
alter table public.catalog_sources enable row level security;

drop policy if exists "Authenticated users can view the catalog" on public.catalog;
create policy "Authenticated users can view the catalog"
  on public.catalog for select to authenticated using (true);

drop policy if exists "Any signed-in user can add catalog products" on public.catalog;
create policy "Any signed-in user can add catalog products"
  on public.catalog for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists "Any signed-in user can edit catalog products" on public.catalog;
create policy "Any signed-in user can edit catalog products"
  on public.catalog for update to authenticated
  using (true) with check (true);

drop policy if exists "Admins delete catalog products" on public.catalog;
create policy "Admins delete catalog products"
  on public.catalog for delete to authenticated
  using (public.is_admin());

drop policy if exists "Authenticated users can view catalog imports" on public.catalog_imports;
create policy "Authenticated users can view catalog imports"
  on public.catalog_imports for select to authenticated using (true);

drop policy if exists "Any signed-in user can record a catalog import" on public.catalog_imports;
create policy "Any signed-in user can record a catalog import"
  on public.catalog_imports for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists "Admins delete catalog imports" on public.catalog_imports;
create policy "Admins delete catalog imports"
  on public.catalog_imports for delete to authenticated
  using (public.is_admin());

drop policy if exists "Authenticated users can view catalog sources" on public.catalog_sources;
create policy "Authenticated users can view catalog sources"
  on public.catalog_sources for select to authenticated using (true);

drop policy if exists "Any signed-in user can record a catalog source" on public.catalog_sources;
create policy "Any signed-in user can record a catalog source"
  on public.catalog_sources for insert to authenticated
  with check (true);

drop policy if exists "Admins delete catalog sources" on public.catalog_sources;
create policy "Admins delete catalog sources"
  on public.catalog_sources for delete to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Bootstrap the first administrator (run once, after that account exists):
--
--   update public.profiles set role = 'admin' where email = 'you@example.com';
--
-- This works from the SQL editor because auth.uid() is NULL there, so the
-- escalation guard above does not apply.
-- ---------------------------------------------------------------------------

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
-- Bootstrap the first administrator (run once, after that account exists):
--
--   update public.profiles set role = 'admin' where email = 'you@example.com';
--
-- This works from the SQL editor because auth.uid() is NULL there, so the
-- escalation guard above does not apply.
-- ---------------------------------------------------------------------------

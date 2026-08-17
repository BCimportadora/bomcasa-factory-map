-- Bomcasa Factory Map — database schema
-- Run this once in the Supabase SQL editor for a fresh project.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user, stores the app role
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'business_user' check (role in ('admin', 'business_user')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- New auth users automatically get a profile row (default role: business_user).
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------------
-- factories
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

create index if not exists factories_created_by_idx on public.factories(created_by);
create index if not exists factories_province_idx on public.factories(province);
create index if not exists factories_city_idx on public.factories(city);

alter table public.factories enable row level security;

-- security definer + stable so this can be called from RLS policies without recursion
create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer stable set search_path = public;

create policy "Admins see all factories, business users see their own"
  on public.factories for select
  using (created_by = auth.uid() or public.is_admin());

create policy "Authenticated users insert their own factories"
  on public.factories for insert
  with check (created_by = auth.uid());

create policy "Admins update all, business users update their own"
  on public.factories for update
  using (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());

create policy "Admins delete all, business users delete their own"
  on public.factories for delete
  using (created_by = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- Promoting a user to admin (run manually after they've signed up):
-- update public.profiles set role = 'admin' where email = 'someone@example.com';
-- ---------------------------------------------------------------------------

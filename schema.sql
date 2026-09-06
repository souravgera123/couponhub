create extension if not exists pgcrypto;

create type public.user_role as enum ('customer','admin');

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role public.user_role not null default 'customer',
  created_at timestamptz not null default now()
);

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  title text not null,
  category text not null,
  description text default '',
  original_price integer not null check (original_price >= 0),
  selling_price integer not null check (selling_price >= 0),
  code text not null,
  stock integer not null default 1 check (stock >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  coupon_id uuid references public.coupons(id) on delete set null,
  amount integer not null,
  status text not null default 'created',
  razorpay_order_id text unique,
  razorpay_payment_id text,
  coupon_code text,
  created_at timestamptz not null default now()
);

create index if not exists coupons_active_idx on public.coupons(active);
create index if not exists orders_user_idx on public.orders(user_id);

alter table public.profiles enable row level security;
alter table public.coupons enable row level security;
alter table public.orders enable row level security;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin') $$;

drop policy if exists "public active coupons" on public.coupons;
create policy "public active coupons" on public.coupons for select using (active=true or public.is_admin());

drop policy if exists "admin coupons insert" on public.coupons;
create policy "admin coupons insert" on public.coupons for insert with check (public.is_admin());
drop policy if exists "admin coupons update" on public.coupons;
create policy "admin coupons update" on public.coupons for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin coupons delete" on public.coupons;
create policy "admin coupons delete" on public.coupons for delete using (public.is_admin());

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for select using (id=auth.uid() or public.is_admin());

drop policy if exists "own orders" on public.orders;
create policy "own orders" on public.orders for select using (user_id=auth.uid() or public.is_admin());

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public
as $$ begin insert into public.profiles(id,email) values(new.id,new.email) on conflict(id) do nothing; return new; end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

alter table public.coupons replica identity full;
alter table public.orders replica identity full;

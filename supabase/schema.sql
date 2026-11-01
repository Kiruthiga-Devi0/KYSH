-- KYSH database. Paste this whole file into Supabase → SQL Editor → Run. Safe to run more than once.

-- ---------- profiles: one row per signed-up user ----------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- products: edit these in Table Editor, the shop updates instantly ----------
create table if not exists public.products (
  id          integer primary key,
  name        text    not null,
  brand       text    not null default 'KYSH',
  category    text    not null,
  img         text    not null,
  price       integer not null check (price > 0),
  old_price   integer not null check (old_price >= price),
  discount    integer not null default 0,
  description text,
  fabric      text,
  fit         text,
  care        text,
  sizes       text[]  not null default array['S','M','L','XL','XXL'],
  stock       integer not null default 0 check (stock >= 0),
  active      boolean not null default true
);

-- ---------- coupons ----------
create table if not exists public.coupons (
  code   text primary key check (code = upper(code)),
  type   text not null check (type in ('percent', 'flat')),
  value  integer not null check (value > 0),
  max    integer,
  min    integer not null default 0,
  label  text,
  active boolean not null default true
);

-- ---------- orders: written ONLY by the server (service key), readable by their owner ----------
create table if not exists public.orders (
  id                text primary key,
  user_id           uuid not null references auth.users (id) on delete cascade,
  created_at        timestamptz not null default now(),
  items             jsonb not null,
  address           jsonb not null,
  payment           text  not null check (payment in ('cod', 'online')),
  payment_id        text,
  razorpay_order_id text unique,
  subtotal          integer not null,
  discount          integer not null default 0,
  coupon            text,
  total             integer not null check (total > 0),
  status            text not null
);
create index if not exists orders_user_idx on public.orders (user_id, created_at desc);

-- ---------- row level security ----------
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.coupons  enable row level security;
alter table public.orders   enable row level security;

drop policy if exists "profiles: read own"   on public.profiles;
drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: read own"   on public.profiles for select using (auth.uid() = id);
create policy "profiles: update own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "products: public read" on public.products;
create policy "products: public read" on public.products for select using (active);

drop policy if exists "coupons: public read" on public.coupons;
create policy "coupons: public read" on public.coupons for select using (active);

-- Customers can only SEE their own orders. There is deliberately no insert/update policy:
-- the browser can never create or edit an order, so nobody can write their own price.
drop policy if exists "orders: read own" on public.orders;
create policy "orders: read own" on public.orders for select using (auth.uid() = user_id);

-- ---------- contact form messages: anyone can send one, only you (dashboard) can read them ----------
create table if not exists public.contact_messages (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  name       text not null check (char_length(name)    between 1 and 100),
  email      text not null check (char_length(email)   between 3 and 200),
  subject    text not null check (char_length(subject) between 1 and 200),
  message    text not null check (char_length(message) between 1 and 4000)
);
alter table public.contact_messages enable row level security;
drop policy if exists "contact: anyone can send" on public.contact_messages;
create policy "contact: anyone can send" on public.contact_messages for insert to anon, authenticated with check (true);

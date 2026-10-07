-- Bounded proof migration: booking hold + Stripe billing receipt.
-- No production credentials or customer data are required.

create extension if not exists pgcrypto;

create table if not exists public.booking_holds (
  id uuid primary key default gen_random_uuid(),
  external_slot_id text not null,
  customer_ref text,
  quoted_amount_cents integer not null check (quoted_amount_cents >= 0),
  currency text not null check (char_length(currency) = 3),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'released', 'expired')),
  hold_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists booking_holds_active_slot_idx
  on public.booking_holds (external_slot_id)
  where status in ('pending', 'confirmed');

create table if not exists public.bookings_billed (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.booking_holds(id) on delete restrict,
  stripe_event_id text not null unique,
  stripe_session_id text not null unique,
  stripe_payment_intent_id text unique,
  amount_total integer check (amount_total is null or amount_total >= 0),
  currency text check (currency is null or char_length(currency) = 3),
  payment_status text,
  created_at timestamptz not null default now()
);

create index if not exists bookings_billed_booking_id_idx
  on public.bookings_billed (booking_id);

alter table public.booking_holds enable row level security;
alter table public.bookings_billed enable row level security;

-- Intentionally no public/client policies in this proof.
-- Server-side service-role code would perform writes after verified webhook processing.

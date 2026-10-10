-- Draft schema. Must be reviewed and tested before use. No public RLS access policies granted.
create extension if not exists pgcrypto;
create table if not exists public.ea_organisations(id uuid primary key default gen_random_uuid(), name text not null, created_at timestamptz not null default now());
create table if not exists public.ea_leads(id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.ea_organisations(id), company text not null, contact_name text not null, email text not null, challenge text, stage text not null default 'new', contact_consent boolean not null default false, marketing_consent boolean not null default false, utm_source text, utm_medium text, utm_campaign text, created_at timestamptz not null default now());
create table if not exists public.ea_payments(id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.ea_organisations(id), lead_id uuid references public.ea_leads(id), stripe_session_id text unique, amount_cents integer not null, status text not null default 'pending', created_at timestamptz not null default now());
create table if not exists public.ea_suppression(organisation_id uuid not null references public.ea_organisations(id), email_hash text not null, reason text not null, primary key(organisation_id,email_hash));
alter table public.ea_organisations enable row level security;
alter table public.ea_leads enable row level security;
alter table public.ea_payments enable row level security;
alter table public.ea_suppression enable row level security;
-- Add tenant-scoped authenticated policies only after verifying authorization design.

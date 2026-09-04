create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  discount_percent integer not null check (discount_percent >= 0 and discount_percent <= 100),
  active_category text not null,
  status text not null default 'inactive' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now()
);

create index if not exists campaigns_status_idx on public.campaigns(status);

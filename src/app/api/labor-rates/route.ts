create table if not exists public.division_rates (
  id bigserial primary key,
  division_id uuid not null references public.divisions(id) on delete cascade,
  hourly_rate numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per division (enforces “1 rate per division”)
create unique index if not exists division_rates_division_id_key
on public.division_rates(division_id);

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_division_rates_updated_at on public.division_rates;

create trigger trg_division_rates_updated_at
before update on public.division_rates
for each row execute procedure public.set_updated_at();

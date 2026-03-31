-- Add fuel_charge_pct to divisions (default 0, stored as whole number e.g. 4 = 4%)
alter table divisions add column if not exists fuel_charge_pct numeric not null default 0;

-- Add per-bid fuel_charge_pct override (null = inherit from division)
alter table bids add column if not exists fuel_charge_pct numeric default null;

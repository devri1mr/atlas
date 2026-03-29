alter table lawn_production_reports
  add column if not exists is_complete boolean not null default false;

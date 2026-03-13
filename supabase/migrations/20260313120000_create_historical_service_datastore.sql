create extension if not exists pgcrypto;

create table public.historical_services (
  id uuid primary key default gen_random_uuid(),
  service_key text not null unique,
  service_date date not null,
  train_uid text,
  rid text,
  toc_code text,
  origin_crs text not null,
  destination_crs text not null,
  scheduled_departure_origin timestamptz not null,
  scheduled_arrival_destination timestamptz,
  actual_departure_origin timestamptz,
  actual_arrival_destination timestamptz,
  status text not null default 'unknown',
  is_cancelled boolean not null default false,
  is_part_cancelled boolean not null default false,
  delay_minutes integer,
  data_quality_score integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint historical_services_service_key_not_empty check (btrim(service_key) <> ''),
  constraint historical_services_status_not_empty check (btrim(status) <> ''),
  constraint historical_services_origin_crs_format check (
    length(origin_crs) = 3 and origin_crs = upper(origin_crs)
  ),
  constraint historical_services_destination_crs_format check (
    length(destination_crs) = 3 and destination_crs = upper(destination_crs)
  ),
  constraint historical_services_toc_code_format check (
    toc_code is null or (length(toc_code) = 2 and toc_code = upper(toc_code))
  ),
  constraint historical_services_delay_minutes_non_negative check (
    delay_minutes is null or delay_minutes >= 0
  ),
  constraint historical_services_data_quality_score_non_negative check (
    data_quality_score >= 0
  )
);

create table public.historical_service_search (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.historical_services(id) on delete cascade,
  service_date date not null,
  origin_crs text not null,
  destination_crs text not null,
  scheduled_departure_ts timestamptz not null,
  scheduled_arrival_ts timestamptz,
  toc_code text,
  status text not null default 'unknown',
  is_cancelled boolean not null default false,
  delay_minutes integer,
  created_at timestamptz not null default now(),
  constraint historical_service_search_status_not_empty check (btrim(status) <> ''),
  constraint historical_service_search_origin_crs_format check (
    length(origin_crs) = 3 and origin_crs = upper(origin_crs)
  ),
  constraint historical_service_search_destination_crs_format check (
    length(destination_crs) = 3 and destination_crs = upper(destination_crs)
  ),
  constraint historical_service_search_toc_code_format check (
    toc_code is null or (length(toc_code) = 2 and toc_code = upper(toc_code))
  ),
  constraint historical_service_search_delay_minutes_non_negative check (
    delay_minutes is null or delay_minutes >= 0
  )
);

create index historical_service_search_date_origin_destination_departure_idx
  on public.historical_service_search (
    service_date,
    origin_crs,
    destination_crs,
    scheduled_departure_ts
  );

create index historical_service_search_date_origin_departure_idx
  on public.historical_service_search (
    service_date,
    origin_crs,
    scheduled_departure_ts
  );

create index historical_service_search_date_destination_departure_idx
  on public.historical_service_search (
    service_date,
    destination_crs,
    scheduled_departure_ts
  );

create index historical_service_search_service_id_idx
  on public.historical_service_search (service_id);

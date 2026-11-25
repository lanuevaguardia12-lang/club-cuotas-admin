-- Private staging area: preserve complete source workbooks before transforming data.
-- This schema is intentionally not exposed through the Supabase Data API.
create schema if not exists club_private;
revoke all on schema club_private from public, anon, authenticated;

create table club_private.import_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'staged' check (status in ('staged','verified','activated')),
  source text not null default 'google-sheets',
  manifest jsonb not null default '{}'::jsonb
);

create table club_private.source_sheets (
  run_id uuid not null references club_private.import_runs(id),
  spreadsheet_id text not null,
  sheet_id integer not null,
  title text not null,
  row_count integer not null check (row_count >= 0),
  checksum text not null check (length(checksum) = 64),
  -- Includes workbook metadata, cell values, formulas and formatting when imported.
  payload jsonb not null,
  primary key (run_id, spreadsheet_id, sheet_id)
);

alter table club_private.import_runs enable row level security;
alter table club_private.source_sheets enable row level security;
revoke all on all tables in schema club_private from public, anon, authenticated;

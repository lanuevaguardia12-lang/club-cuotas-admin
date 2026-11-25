create schema club_finance;
revoke all on schema club_finance from public, anon, authenticated;

create table club_finance.costs (
 sequence bigint generated always as identity unique,
 data jsonb not null,
 id text generated always as (data->>'id') stored primary key,
 type text generated always as (data->>'type') stored not null check(type in ('fixed','court','coach','custom')),
 period text generated always as (data->>'startPeriod') stored not null,
 amount numeric generated always as ((data->>'amount')::numeric) stored not null check(amount>=0),
 check(length(id)>0), check(period ~ '^\d{4}-\d{2}$')
);
create index costs_period on club_finance.costs(period,type);
create table club_finance.actuals (
 sequence bigint generated always as identity unique, data jsonb not null,
 id text generated always as (data->>'id') stored primary key,
 cost_id text generated always as (data->>'costId') stored not null,
 period text generated always as (data->>'period') stored not null,
 unique(cost_id,period)
);
create table club_finance.player_statuses (
 sequence bigint generated always as identity unique, data jsonb not null,
 id text generated always as (data->>'id') stored primary key,
 player_id text generated always as (data->>'playerId') stored not null,
 period text generated always as (data->>'period') stored not null,
 unique(player_id,period)
);
create table club_finance.cash_flow (
 sequence bigint generated always as identity unique, data jsonb not null,
 id text generated always as (data->>'id') stored primary key,
 period text generated always as (data->>'period') stored not null,
 amount numeric generated always as ((data->>'amount')::numeric) stored not null check(amount>=0),
 type text generated always as (data->>'type') stored not null check(type in ('income','expense')),
 check(length(id)>0)
);
create index cash_flow_period on club_finance.cash_flow(period);
create table club_finance.benefits (
 sequence bigint generated always as identity unique, data jsonb not null,
 id text generated always as (data->>'id') stored primary key,
 fundraising_id text generated always as (data->>'fundraisingId') stored not null,
 cost_id text generated always as (data->>'costId') stored,
 reversal_of text generated always as (nullif(data->>'reversalOf','')) stored unique,
 period text generated always as (data->>'period') stored not null,
 check(length(id)>0), check(jsonb_typeof(data->'allocations')='array')
);
create index benefits_source on club_finance.benefits(fundraising_id);
create index benefits_period on club_finance.benefits(period,cost_id);
create function club_finance.reject_ledger_change() returns trigger language plpgsql as $$
begin raise exception 'El libro de beneficios solo admite movimientos nuevos' using errcode='23514'; end;
$$;
create trigger benefits_append_only before update or delete on club_finance.benefits for each row execute function club_finance.reject_ledger_change();
create table club_finance.fees (
 sequence bigint generated always as identity unique, data jsonb not null,
 id text generated always as (data->>'id') stored primary key,
 player_id text generated always as (data->>'playerId') stored not null,
 period text generated always as (data->>'period') stored not null,
 status text generated always as (data->>'status') stored not null check(status in ('paid','pending','overdue')),
 unique(player_id,period)
);
create table club_finance.payments (
 sequence bigint generated always as identity unique, data jsonb not null,
 id text generated always as (data->>'id') stored primary key,
 provider text generated always as (data->>'provider') stored not null,
 external_id text generated always as (data->>'externalId') stored not null,
 player_id text generated always as (data->>'playerId') stored,
 period text generated always as (data->>'period') stored,
 unique(provider,external_id)
);
create table club_finance.refund_policy (
 sequence bigint generated always as identity unique, data jsonb not null,
 id text generated always as (data->>'id') stored primary key
);
create table club_finance.historic_sources (
 title text primary key, rows jsonb not null,
 run_id uuid not null references club_private.import_runs(id)
);
create table club_finance.imports (
 run_id uuid primary key references club_private.import_runs(id),
 imported_at timestamptz not null default now(), counts jsonb not null
);
-- Only the application server may access these private financial tables.
do $$ declare t record; begin
 for t in select tablename from pg_tables where schemaname='club_finance' loop
 execute format('alter table club_finance.%I enable row level security',t.tablename);
 end loop;
end $$;
revoke all on all tables in schema club_finance from public, anon, authenticated;
revoke all on all sequences in schema club_finance from public, anon, authenticated;
revoke all on all functions in schema club_finance from public, anon, authenticated;

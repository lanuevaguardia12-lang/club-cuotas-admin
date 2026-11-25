create schema club_directory;
revoke all on schema club_directory from public, anon, authenticated;
create table club_directory.players (
  data jsonb not null,
  id text generated always as (data->>'id') stored primary key,
  name text generated always as (data->>'name') stored not null,
  status text generated always as (data->>'status') stored not null check(status in ('active','inactive')),
  check(length(id)>0), check(length(name)>0)
);
create index players_name on club_directory.players(lower(name));
create table club_directory.teams (
  data jsonb not null,
  id text generated always as (data->>'id') stored primary key,
  name text generated always as (data->>'name') stored not null,
  check(length(id)>0), check(length(name)>0)
);
create table club_directory.accounts (
  data jsonb not null,
  id text generated always as (data->>'userId') stored primary key,
  username text generated always as (data->>'username') stored not null,
  role text generated always as (data->>'role') stored not null check(role in ('admin','treasurer','coach','player','fan')),
  player_id text generated always as (data->>'playerId') stored,
  check(length(id)>0), check(length(username)>0)
);
create unique index accounts_username on club_directory.accounts(lower(username));
create index accounts_player on club_directory.accounts(player_id);
-- Historic accounts may point at players absent from the current directory.
-- Preserve those links rather than dropping accounts or inventing players.
create table club_directory.imports (
  run_id uuid primary key references club_private.import_runs(id),
  imported_at timestamptz not null default now(),
  counts jsonb not null
);
alter table club_directory.players enable row level security;
alter table club_directory.teams enable row level security;
alter table club_directory.accounts enable row level security;
alter table club_directory.imports enable row level security;
revoke all on all tables in schema club_directory from public, anon, authenticated;

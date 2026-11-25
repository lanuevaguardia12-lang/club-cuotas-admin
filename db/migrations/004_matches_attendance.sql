create schema club_matches;
revoke all on schema club_matches from public, anon, authenticated;
create table club_matches.matches (
 data jsonb not null,
 id text generated always as (data->>'id') stored primary key,
 date text generated always as (data->>'date') stored not null,
 period text generated always as (data->>'period') stored not null,
 rival text generated always as (data->>'rival') stored not null,
 coach_attended boolean generated always as ((data->>'coachAttended')::boolean) stored not null,
 check(length(id)>0), check(length(rival)>0), check(period ~ '^\d{4}-\d{2}$')
);
create index matches_period on club_matches.matches(period,date);
create unique index matches_identity on club_matches.matches(date,lower(rival),coalesce(data->>'sourceType',''));
create table club_matches.attendances (
 match_id text not null references club_matches.matches(id) on delete cascade,
 position integer not null check(position>=0),
 player_name text not null check(length(player_name)>0),
 -- Legacy names are preserved even if the player is no longer in the directory.
 player_id text,
 primary key(match_id,position)
);
create index attendances_player on club_matches.attendances(player_id,match_id);
create table club_matches.snapshots (
 data jsonb not null,
 id text generated always as (data->>'id') stored primary key,
 player_id text generated always as (data->>'playerId') stored not null,
 season_year integer generated always as ((data->>'seasonYear')::integer) stored not null,
 unique(player_id,season_year)
);
create table club_matches.imports (
 run_id uuid primary key references club_private.import_runs(id),
 imported_at timestamptz not null default now(), counts jsonb not null
);
alter table club_matches.matches enable row level security;
alter table club_matches.attendances enable row level security;
alter table club_matches.snapshots enable row level security;
alter table club_matches.imports enable row level security;
revoke all on all tables in schema club_matches from public, anon, authenticated;

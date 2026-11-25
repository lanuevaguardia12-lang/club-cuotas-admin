-- The source contains repeated cached summaries. Keep every historic version,
-- and select one current summary per player/season without losing source data.
create table club_matches.snapshot_history (
 sequence bigint generated always as identity primary key,
 run_id uuid not null references club_private.import_runs(id),
 data jsonb not null
);
alter table club_matches.snapshot_history enable row level security;
revoke all on club_matches.snapshot_history from public, anon, authenticated;
revoke all on all sequences in schema club_matches from public, anon, authenticated;

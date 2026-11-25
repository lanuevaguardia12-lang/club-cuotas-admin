-- Preserve the source order for multiple matches on the same day. Attendance
-- streaks must not change merely because records moved from Sheets to SQL.
alter table club_matches.matches add column sequence bigint generated always as identity unique;

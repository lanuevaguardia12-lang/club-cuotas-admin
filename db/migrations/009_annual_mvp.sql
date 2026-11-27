create schema club_surveys;
revoke all on schema club_surveys from public, anon, authenticated;

create table club_surveys.annual_mvp (
  year integer primary key check (year between 1900 and 9999),
  opened_at timestamptz not null default now(),
  closed_at timestamptz check (closed_at >= opened_at)
);

create table club_surveys.annual_mvp_candidates (
  year integer not null references club_surveys.annual_mvp(year),
  candidate_id text not null,
  player_id text,
  name text not null check (length(name) > 0),
  primary key (year, candidate_id)
);

create table club_surveys.annual_mvp_votes (
  year integer not null,
  user_id text not null,
  candidate_id text not null,
  primary key (year, user_id),
  foreign key (year, candidate_id) references club_surveys.annual_mvp_candidates(year, candidate_id)
);
create index annual_mvp_votes_candidate on club_surveys.annual_mvp_votes(year, candidate_id);

alter table club_surveys.annual_mvp enable row level security;
alter table club_surveys.annual_mvp_candidates enable row level security;
alter table club_surveys.annual_mvp_votes enable row level security;
revoke all on all tables in schema club_surveys from public, anon, authenticated;

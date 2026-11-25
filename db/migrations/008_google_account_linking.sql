create schema club_auth;
revoke all on schema club_auth from public, anon, authenticated;

-- These refer to the application's existing IDs, including accounts originally
-- configured in AUTH_USERS_JSON. Google never creates a player or account.
create table club_auth.google_identities (
  user_id text primary key check (length(user_id) > 0),
  google_sub text not null unique check (length(google_sub) between 1 and 255),
  email text not null check (length(email) between 3 and 320),
  linked_at timestamptz not null default now()
);
create table club_auth.google_preferences (
  user_id text primary key check (length(user_id) > 0),
  dismissed_at timestamptz not null default now()
);
create table club_auth.google_flows (
  state_hash text primary key check (state_hash ~ '^[a-f0-9]{64}$'),
  mode text not null check (mode in ('login', 'link')),
  user_id text,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  check ((mode = 'link' and user_id is not null) or (mode = 'login' and user_id is null))
);
create index google_flows_expiration on club_auth.google_flows(expires_at);
alter table club_auth.google_identities enable row level security;
alter table club_auth.google_preferences enable row level security;
alter table club_auth.google_flows enable row level security;
revoke all on all tables in schema club_auth from public, anon, authenticated;

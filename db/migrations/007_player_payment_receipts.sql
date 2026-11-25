create table club_finance.payment_receipts (
 data jsonb not null,
 id uuid generated always as ((data->>'id')::uuid) stored primary key,
 user_id text generated always as (data->>'userId') stored not null,
 player_id text generated always as (data->>'playerId') stored not null,
 created_at timestamptz not null default now(),
 total_cents bigint generated always as ((data->>'totalCents')::bigint) stored not null check(total_cents>0),
 object_path text generated always as (data->>'objectPath') stored not null unique,
 check(data->>'bucket'='club-payment-receipts'),
 check((data->>'fileSize')::integer between 1 and 4194304),
 check(data->>'mimeType' in ('application/pdf','image/jpeg','image/png','image/webp'))
);
create index payment_receipts_player on club_finance.payment_receipts(player_id,created_at desc);
create table club_finance.payment_receipt_items (
 receipt_id uuid not null references club_finance.payment_receipts(id),
 period text not null check(period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
 amount_cents bigint not null check(amount_cents>0),
 primary key(receipt_id,period)
);
alter table club_finance.payment_receipts enable row level security;
alter table club_finance.payment_receipt_items enable row level security;
revoke all on club_finance.payment_receipts,club_finance.payment_receipt_items from public,anon,authenticated;
-- Private Storage bucket. Access is authorized by the app's server session;
-- no public or Supabase Auth policies are granted to these objects.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('club-payment-receipts','club-payment-receipts',false,4194304,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
do $$ begin
 if exists(select 1 from storage.buckets where id='club-payment-receipts' and public) then
 raise exception 'El bucket de comprobantes debe ser privado';
 end if;
end $$;

-- Express owns authentication. Only its dedicated database login may adopt these roles.
create role metamarket_backend login noinherit;
create role metamarket_player nologin;
create role metamarket_system nologin;
grant metamarket_player, metamarket_system to metamarket_backend;

create schema metamarket;
revoke all on schema metamarket from public, anon, authenticated, service_role;
grant usage on schema metamarket to metamarket_player, metamarket_system;

create table metamarket.accounts (
  id text primary key,
  google_id text not null unique,
  email text not null unique,
  name text not null,
  username text check (username ~ '^[A-Za-z0-9_]{3,24}$'),
  terms_accepted_at timestamptz,
  starter_gift_amount numeric(16, 2),
  starter_gift_seen_at timestamptz,
  is_admin boolean not null default false,
  balance numeric(16, 2) not null default 1000 check (balance >= 0),
  trade_history jsonb not null default '[]',
  positions jsonb not null default '[]',
  holdings jsonb not null default '[]',
  last_rank integer,
  last_rank_update timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index accounts_username_unique on metamarket.accounts (lower(username));

create table metamarket.markets (
  id text primary key,
  status text not null check (status in ('active', 'resolved_yes', 'resolved_no', 'resolved_option')),
  state jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index markets_catalog_idx on metamarket.markets (status, created_at desc);

create table metamarket.binary_markets (
  id text primary key,
  asset_pair text not null,
  start_time timestamptz not null,
  end_time timestamptz not null check (end_time > start_time),
  status text not null check (status in ('waiting', 'active', 'settling', 'settled_up', 'settled_down')),
  state jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (asset_pair, start_time)
);
create index binary_markets_status_end_idx on metamarket.binary_markets (status, end_time desc);

create table metamarket.binary_trades (
  market_id text not null references metamarket.binary_markets(id) on delete cascade,
  ordinal integer not null check (ordinal > 0),
  user_id text not null references metamarket.accounts(id),
  trade jsonb not null,
  primary key (market_id, ordinal)
);
create index binary_trades_owner_idx on metamarket.binary_trades (user_id, market_id);

create table metamarket.comments (
  id text primary key,
  market_id text not null references metamarket.markets(id) on delete cascade,
  user_id text not null references metamarket.accounts(id),
  user_name text not null,
  content text not null check (length(btrim(content)) > 0),
  created_at timestamptz not null default now()
);
create index comments_market_idx on metamarket.comments (market_id, created_at desc);

create table metamarket.treasury (
  singleton boolean primary key default true check (singleton),
  real_reserves double precision not null default 0,
  solvency_threshold double precision not null default 1
);
insert into metamarket.treasury default values;

create function metamarket.account_id() returns text
language sql stable set search_path = ''
as $$ select nullif(current_setting('metamarket.account_id', true), '') $$;

create function metamarket.can_play() returns boolean
language sql stable set search_path = ''
as $$
  select exists (
    select 1 from metamarket.accounts
    where id = metamarket.account_id() and username is not null and terms_accepted_at is not null
  )
$$;

revoke execute on all functions in schema metamarket from public, anon, authenticated, service_role;
grant execute on all functions in schema metamarket to metamarket_player;

revoke all on all tables in schema metamarket from public, anon, authenticated, service_role;
grant select on metamarket.accounts, metamarket.markets, metamarket.binary_markets,
  metamarket.binary_trades, metamarket.comments to metamarket_player;
grant update (username, terms_accepted_at, starter_gift_seen_at, trade_history, updated_at)
  on metamarket.accounts to metamarket_player;
grant insert on metamarket.comments to metamarket_player;
grant select, insert, update on metamarket.accounts, metamarket.markets,
  metamarket.binary_markets, metamarket.binary_trades to metamarket_system;
grant delete on metamarket.binary_markets to metamarket_system;
grant select, update on metamarket.treasury to metamarket_system;

do $$
declare
  relation text;
begin
  foreach relation in array array['accounts', 'markets', 'binary_markets', 'binary_trades', 'comments', 'treasury'] loop
    execute format('alter table metamarket.%I enable row level security', relation);
    execute format('alter table metamarket.%I force row level security', relation);
    execute format('create policy system_access on metamarket.%I to metamarket_system using (true) with check (true)', relation);
  end loop;
end $$;

create policy account_read on metamarket.accounts for select to metamarket_player
  using (id = (select metamarket.account_id()));
create policy account_update on metamarket.accounts for update to metamarket_player
  using (id = (select metamarket.account_id())) with check (id = (select metamarket.account_id()));
create policy markets_read on metamarket.markets for select to metamarket_player
  using ((select metamarket.can_play()));
create policy binary_markets_read on metamarket.binary_markets for select to metamarket_player
  using ((select metamarket.can_play()));
create policy binary_trades_read on metamarket.binary_trades for select to metamarket_player
  using ((select metamarket.can_play()) and user_id = (select metamarket.account_id()));
create policy comments_read on metamarket.comments for select to metamarket_player
  using ((select metamarket.can_play()));
create policy comments_create on metamarket.comments for insert to metamarket_player
  with check ((select metamarket.can_play()) and user_id = (select metamarket.account_id()));

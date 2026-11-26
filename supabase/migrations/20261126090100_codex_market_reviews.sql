create table metamarket.codex_market_reviews (
  id uuid primary key,
  revision integer not null check (revision > 0),
  phase text not null check (phase in (
    'draft', 'draft_dismissed', 'live', 'awaiting_evidence',
    'resolution', 'resolution_dismissed', 'settled'
  )),
  draft jsonb not null,
  market_id text unique references metamarket.markets(id),
  evidence jsonb,
  reviewed_by text references metamarket.accounts(id),
  updated_at timestamptz not null default now(),
  check ((phase in ('draft','draft_dismissed')) = (market_id is null))
);
alter table metamarket.codex_market_reviews enable row level security;
alter table metamarket.codex_market_reviews force row level security;
grant select, insert, update on metamarket.codex_market_reviews to metamarket_system;
create policy system_access on metamarket.codex_market_reviews to metamarket_system
  using (true) with check (true);

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- The token only authorizes this job. Keep it out of the HTTP queue's reader roles.
revoke all on table net.http_request_queue from public, anon, authenticated, metamarket_backend, metamarket_player, metamarket_system;

select cron.schedule(
  'metamarket-btc-cycle',
  '10 seconds',
  $job$
  select net.http_post(
    url := rtrim(endpoint.decrypted_secret, '/') || '/functions/v1/btc-cycle',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-metamarket-cron-token', token.decrypted_secret
    ),
    timeout_milliseconds := 30000
  )
  from vault.decrypted_secrets as endpoint
  cross join vault.decrypted_secrets as token
  where endpoint.name = 'metamarket_edge_url'
    and token.name = 'metamarket_cron_token';
  $job$
);

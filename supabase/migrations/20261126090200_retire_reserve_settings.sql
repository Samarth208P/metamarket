-- Retain historical settings while removing the application's access to them.
revoke select, update on metamarket.treasury from metamarket_system;

update metamarket.accounts
set is_admin = true, updated_at = now()
where lower(email) = 'samarth208p@gmail.com' and not is_admin;

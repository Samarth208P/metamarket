alter table metamarket.accounts
  add column avatar_path text
  check (avatar_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$');

grant update (avatar_path) on metamarket.accounts to metamarket_player;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-images', 'profile-images', true, 5242880,
  array['image/jpeg', 'image/png', 'image/webp']
);

-- Public images are served by Storage. Only the server may manage their objects.
create policy profile_images_server_only
on storage.objects as restrictive for all to anon, authenticated
using (bucket_id <> 'profile-images')
with check (bucket_id <> 'profile-images');

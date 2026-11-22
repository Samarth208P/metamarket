insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'market-images', 'market-images', true, 5242880,
  array['image/jpeg', 'image/png', 'image/webp']
);

-- Public images are served by Storage. Only the server may manage their objects.
create policy market_images_server_only
on storage.objects as restrictive for all to anon, authenticated
using (bucket_id <> 'market-images')
with check (bucket_id <> 'market-images');

-- 0010 — Storage bucket + policies for resumes (FR-02.4).
-- Works on real Supabase (storage.* provided by the platform) and on the local
-- storage shim from bootstrap.sql, so the policy logic is validated locally too.
-- Path convention: '<owner_user_id>/<unguessable-uuid>.<ext>'. Bucket is private.

insert into storage.buckets (id, name, public)
values ('resumes', 'resumes', false)
on conflict (id) do nothing;

alter table storage.objects enable row level security;

-- Owners may upload only under their own uid folder.
create policy "resumes_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

-- Owners may read/delete only their own objects.
create policy "resumes_select_own" on storage.objects for select to authenticated
  using (bucket_id = 'resumes' and owner = auth.uid());

create policy "resumes_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'resumes' and owner = auth.uid());

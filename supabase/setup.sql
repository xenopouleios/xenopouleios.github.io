begin;

create table if not exists public.site_administrators (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.site_administrators enable row level security;
revoke all on public.site_administrators from anon, authenticated;

create or replace function public.is_site_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.site_administrators where user_id = auth.uid());
$$;
revoke all on function public.is_site_admin() from public;
grant execute on function public.is_site_admin() to authenticated;

create table if not exists public.site_content (
  id integer primary key check (id = 1),
  document jsonb not null default '{"fields":{},"images":{},"posts":[]}'::jsonb,
  version integer not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint valid_document check (
    jsonb_typeof(document) = 'object'
    and jsonb_typeof(document -> 'fields') = 'object'
    and jsonb_typeof(document -> 'images') = 'object'
    and jsonb_typeof(document -> 'posts') = 'array'
    and document ?& array['fields', 'images', 'posts']
    and jsonb_array_length(document -> 'posts') <= 500
    and octet_length(document::text) <= 2097152
  )
);
alter table public.site_content enable row level security;
revoke all on public.site_content from anon, authenticated;
grant select (id, document, version) on public.site_content to anon, authenticated;
create policy "Anyone can read published content" on public.site_content for select to anon, authenticated using (true);
insert into public.site_content (id) values (1) on conflict do nothing;

create or replace function public.publish_site(content jsonb, expected_version integer)
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  new_version integer;
begin
  if not public.is_site_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if content is null or jsonb_typeof(content) <> 'object'
     or not (content ?& array['fields', 'images', 'posts'])
     or jsonb_typeof(content -> 'fields') <> 'object'
     or jsonb_typeof(content -> 'images') <> 'object'
     or jsonb_typeof(content -> 'posts') <> 'array' then
    raise exception 'Invalid content' using errcode = '22023';
  end if;
  update public.site_content
    set document = content, version = version + 1, updated_at = now(), updated_by = auth.uid()
    where id = 1 and version = expected_version
    returning version into new_version;
  if not found then
    raise exception 'Content changed. Reload before publishing.' using errcode = '40001';
  end if;
  return new_version;
end;
$$;
revoke all on function public.publish_site(jsonb, integer) from public;
grant execute on function public.publish_site(jsonb, integer) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-images', 'site-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
create policy "Administrators can upload images"
on storage.objects for insert to authenticated
with check (bucket_id = 'site-images' and public.is_site_admin());

commit;

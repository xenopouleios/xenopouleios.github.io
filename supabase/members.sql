begin;

create schema if not exists xenopouleio_private;
revoke all on schema xenopouleio_private from public, anon, authenticated;

create table xenopouleio_private.members (
  id uuid primary key default gen_random_uuid(),
  member_code text not null unique check (member_code ~ '^[0-9]{1,20}$'),
  surname text not null default '' check (length(surname) <= 300),
  given_name text not null default '' check (length(given_name) <= 300),
  source_sheet text,
  source_row integer,
  version integer not null default 1,
  needs_review boolean generated always as (
    btrim(surname) = '' or btrim(given_name) ~ '^[0-9]+$'
  ) stored,
  unique (source_sheet, source_row)
);
alter table xenopouleio_private.members enable row level security;
revoke all on xenopouleio_private.members from public, anon, authenticated;

create function public.members_search(search_term text default '', page_number integer default 1, review_only boolean default false)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare result jsonb;
begin
  if not public.is_site_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if search_term is null or length(search_term) > 200 or page_number is null
    or page_number < 1 or page_number > 100000 or review_only is null then
    raise exception 'Invalid member search' using errcode = '22023';
  end if;
  perform set_config('response.headers', '[{"Cache-Control":"no-store"}]', true);
  with matches as materialized (
    select m.* from xenopouleio_private.members m
    where (not review_only or m.needs_review) and not exists (
      select 1 from regexp_split_to_table(trim(public.library_normalize(search_term)), '\s+') word
      where word <> '' and position(word in public.library_normalize(
        m.member_code || ' ' || m.surname || ' ' || m.given_name
      )) = 0
    )
  ), items as (
    select id, member_code, surname, given_name, version, needs_review
    from matches order by member_code::numeric, id
    limit 20 offset ((page_number - 1)::bigint * 20)
  )
  select jsonb_build_object(
    'total', (select count(*) from matches),
    'review_total', (select count(*) from xenopouleio_private.members where needs_review),
    'items', coalesce((select jsonb_agg(to_jsonb(items) order by member_code::numeric, id) from items), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.members_search(text, integer, boolean) from public, anon;
grant execute on function public.members_search(text, integer, boolean) to authenticated;

create function public.members_save(member_data jsonb, member_id uuid default null, expected_version integer default null)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare saved_id uuid;
begin
  if not public.is_site_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if member_data is null or jsonb_typeof(member_data) <> 'object'
    or not (member_data ?& array['member_code', 'surname', 'given_name']) then
    raise exception 'Invalid member data' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_each(member_data) e where
    e.key not in ('member_code', 'surname', 'given_name') or jsonb_typeof(e.value) <> 'string')
    or btrim(member_data->>'member_code') !~ '^[0-9]{1,20}$'
    or length(member_data->>'surname') > 300 or length(member_data->>'given_name') > 300 then
    raise exception 'Invalid member fields' using errcode = '22023';
  end if;
  perform set_config('response.headers', '[{"Cache-Control":"no-store"}]', true);
  if member_id is null then
    insert into xenopouleio_private.members (member_code, surname, given_name)
    values (btrim(member_data->>'member_code'), btrim(member_data->>'surname'), btrim(member_data->>'given_name'))
    returning id into saved_id;
  else
    update xenopouleio_private.members m set
      member_code = btrim(member_data->>'member_code'), surname = btrim(member_data->>'surname'),
      given_name = btrim(member_data->>'given_name'), version = m.version + 1
    where m.id = member_id and m.version = expected_version returning m.id into saved_id;
    if not found then raise exception 'Member changed. Reload.' using errcode = '40001'; end if;
  end if;
  return saved_id;
exception when unique_violation then
  raise exception 'Member code already exists' using errcode = '23505';
end;
$$;
revoke all on function public.members_save(jsonb, uuid, integer) from public, anon;
grant execute on function public.members_save(jsonb, uuid, integer) to authenticated;

create function public.members_delete(member_id uuid, expected_version integer)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_site_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  delete from xenopouleio_private.members where id = member_id and version = expected_version;
  if not found then raise exception 'Member changed. Reload.' using errcode = '40001'; end if;
end;
$$;
revoke all on function public.members_delete(uuid, integer) from public, anon;
grant execute on function public.members_delete(uuid, integer) to authenticated;

create table xenopouleio_private.members_import (payload jsonb not null);
alter table xenopouleio_private.members_import enable row level security;
revoke all on xenopouleio_private.members_import from public, anon, authenticated;
commit;

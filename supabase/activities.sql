begin;

create table xenopouleio_private.activity_registrations (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null,
  activity_kind text not null check (activity_kind in ('child', 'adult')),
  participant_name text not null check (length(btrim(participant_name)) between 2 and 300),
  guardian_name text not null default '' check (length(guardian_name) <= 300),
  phone text not null check (length(btrim(phone)) between 5 and 50),
  phone_key text generated always as (regexp_replace(phone, '[^0-9]', '', 'g')) stored,
  created_at timestamptz not null default now(),
  check (length(phone_key) between 5 and 20),
  check (activity_kind = 'adult' or length(btrim(guardian_name)) between 2 and 300),
  unique (activity_id, phone_key)
);
alter table xenopouleio_private.activity_registrations enable row level security;
revoke all on xenopouleio_private.activity_registrations from public, anon, authenticated;

create function public.activity_register(activity_id uuid, registration_data jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  activity jsonb;
  kind text;
  participant text;
  guardian text := '';
  submitted_phone text;
begin
  if activity_id is null or registration_data is null or jsonb_typeof(registration_data) <> 'object' then
    raise exception 'Invalid registration' using errcode = '22023';
  end if;
  select post into activity
  from public.site_content c
  cross join lateral jsonb_array_elements(c.document->'posts') post
  where c.id = 1 and post->>'id' = activity_id::text
    and post->>'section' in ('draseis-paidia', 'draseis-enilikes')
  limit 1;
  if activity is null or coalesce((activity->>'registration_open')::boolean, false) is not true then
    raise exception 'Registration unavailable' using errcode = '55000';
  end if;

  kind := case activity->>'section' when 'draseis-paidia' then 'child' else 'adult' end;
  if kind = 'child' then
    if not (registration_data ?& array['child_name','guardian_name','phone'])
      or exists (select 1 from jsonb_each(registration_data) where key not in ('child_name','guardian_name','phone') or jsonb_typeof(value) <> 'string') then
      raise exception 'Invalid registration' using errcode = '22023';
    end if;
    participant := btrim(registration_data->>'child_name');
    guardian := btrim(registration_data->>'guardian_name');
  else
    if not (registration_data ?& array['full_name','phone'])
      or exists (select 1 from jsonb_each(registration_data) where key not in ('full_name','phone') or jsonb_typeof(value) <> 'string') then
      raise exception 'Invalid registration' using errcode = '22023';
    end if;
    participant := btrim(registration_data->>'full_name');
  end if;
  submitted_phone := btrim(registration_data->>'phone');
  if length(participant) not between 2 and 300
    or (kind = 'child' and length(guardian) not between 2 and 300)
    or length(submitted_phone) not between 5 and 50
    or length(regexp_replace(submitted_phone, '[^0-9]', '', 'g')) not between 5 and 20 then
    raise exception 'Invalid registration' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(40601018);
  if (select count(*) from xenopouleio_private.activity_registrations where created_at > now() - interval '1 day') >= 300 then
    raise exception 'Daily registration limit reached' using errcode = '54000';
  end if;
  insert into xenopouleio_private.activity_registrations
    (activity_id, activity_kind, participant_name, guardian_name, phone)
  values (activity_id, kind, participant, guardian, submitted_phone)
  on conflict (activity_id, phone_key) do nothing;
end;
$$;

create function public.activity_registrations(list_kind text default 'all', page_number integer default 1)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if not public.is_site_admin() then raise exception 'Administrator required' using errcode = '42501'; end if;
  if list_kind is null or list_kind not in ('all','child','adult')
    or page_number is null or page_number not between 1 and 100000 then
    raise exception 'Invalid list' using errcode = '22023';
  end if;
  perform set_config('response.headers', '[{"Cache-Control":"no-store"}]', true);
  with registrations as (
    select r.*, coalesce(p.post->>'title', 'Δράση που δεν είναι πλέον δημοσιευμένη') as activity_title
    from xenopouleio_private.activity_registrations r
    left join lateral (
      select post from public.site_content c
      cross join lateral jsonb_array_elements(c.document->'posts') post
      where c.id = 1 and post->>'id' = r.activity_id::text
      limit 1
    ) p on true
    where list_kind = 'all' or r.activity_kind = list_kind
  )
  select jsonb_build_object(
    'total', (select count(*) from registrations),
    'items', coalesce((select jsonb_agg(to_jsonb(item) order by item.created_at desc, item.id) from (
      select * from registrations order by created_at desc, id limit 20 offset ((page_number - 1)::bigint * 20)
    ) item), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create function public.activity_registration_delete(registration_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_site_admin() then raise exception 'Administrator required' using errcode = '42501'; end if;
  delete from xenopouleio_private.activity_registrations where id = registration_id;
  if not found then raise exception 'Registration changed' using errcode = '40001'; end if;
end;
$$;

revoke all on function public.activity_register(uuid,jsonb) from public;
grant execute on function public.activity_register(uuid,jsonb) to anon, authenticated;
revoke all on function public.activity_registrations(text,integer), public.activity_registration_delete(uuid) from public, anon;
grant execute on function public.activity_registrations(text,integer), public.activity_registration_delete(uuid) to authenticated;

commit;

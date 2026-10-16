begin;

alter table xenopouleio_private.members add column auth_user_id uuid unique references auth.users(id) on delete set null;

create table xenopouleio_private.applications (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(btrim(full_name)) between 2 and 300),
  guardian_name text not null default '' check (length(guardian_name) <= 300),
  is_minor boolean not null,
  phone text not null check (length(btrim(phone)) between 5 and 50),
  email text not null unique check (email = lower(btrim(email)) and length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  address text not null check (length(btrim(address)) between 3 and 500),
  identity_number text not null check (length(btrim(identity_number)) between 3 and 100),
  member_id uuid unique references xenopouleio_private.members(id) on delete restrict,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  check (not is_minor or length(btrim(guardian_name)) >= 2)
);
alter table xenopouleio_private.applications enable row level security;
revoke all on xenopouleio_private.applications from public, anon, authenticated;

create table xenopouleio_private.loan_requests (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references xenopouleio_private.members(id) on delete restrict,
  book_id uuid not null references public.library_books(id) on delete restrict,
  state text not null default 'pending' check (state in ('pending', 'fulfilled', 'cancelled')),
  created_at timestamptz not null default now()
);
create unique index one_pending_request on xenopouleio_private.loan_requests(member_id, book_id) where state = 'pending';
alter table xenopouleio_private.loan_requests enable row level security;
revoke all on xenopouleio_private.loan_requests from public, anon, authenticated;

create table xenopouleio_private.loans (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references xenopouleio_private.members(id) on delete restrict,
  book_id uuid not null references public.library_books(id) on delete restrict,
  borrowed_at timestamptz not null default now(),
  returned_at timestamptz,
  administrator_id uuid not null references auth.users(id)
);
create unique index one_active_loan on xenopouleio_private.loans(book_id) where returned_at is null;
alter table xenopouleio_private.loans enable row level security;
revoke all on xenopouleio_private.loans from public, anon, authenticated;

alter table public.library_books drop constraint library_books_status_check;
alter table public.library_books add constraint library_books_status_check
  check (status in ('unverified', 'unavailable', 'available', 'borrowed'));

create function xenopouleio_private.protect_loan_status()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if (new.status = 'borrowed') <> exists (
    select 1 from xenopouleio_private.loans l where l.book_id = new.id and l.returned_at is null
  ) then
    raise exception 'Availability is controlled by active loans' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger protect_loan_status before insert or update on public.library_books
  for each row execute function xenopouleio_private.protect_loan_status();

create function public.membership_apply(application_data jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if application_data is null or jsonb_typeof(application_data) <> 'object'
    or not (application_data ?& array['full_name','guardian_name','is_minor','phone','email','address','identity_number'])
    or exists (select 1 from jsonb_each(application_data) e where
      e.key not in ('full_name','guardian_name','is_minor','phone','email','address','identity_number')
      or (e.key <> 'is_minor' and jsonb_typeof(e.value) <> 'string'))
    or jsonb_typeof(application_data->'is_minor') <> 'boolean' then
    raise exception 'Invalid application' using errcode = '22023';
  end if;
  -- Serialize the bounded public intake; never reveal whether a particular email is registered.
  perform pg_advisory_xact_lock(40601016);
  if (select count(*) from xenopouleio_private.applications where created_at > now() - interval '1 day') >= 100 then
    raise exception 'Daily application limit reached' using errcode = '54000';
  end if;
  insert into xenopouleio_private.applications
    (full_name, guardian_name, is_minor, phone, email, address, identity_number)
  values (btrim(application_data->>'full_name'), btrim(application_data->>'guardian_name'),
    (application_data->>'is_minor')::boolean, btrim(application_data->>'phone'),
    lower(btrim(application_data->>'email')), btrim(application_data->>'address'), btrim(application_data->>'identity_number'))
  on conflict (email) do nothing;
end;
$$;

create function public.membership_applications(page_number integer default 1)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare result jsonb;
begin
  if not public.is_site_admin() then raise exception 'Administrator required' using errcode = '42501'; end if;
  if page_number is null or page_number not between 1 and 100000 then raise exception 'Invalid page' using errcode = '22023'; end if;
  perform set_config('response.headers', '[{"Cache-Control":"no-store"}]', true);
  select jsonb_build_object('total', (select count(*) from xenopouleio_private.applications),
    'items', coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from (
      select a.*, m.member_code, m.auth_user_id is not null as account_ready
      from xenopouleio_private.applications a left join xenopouleio_private.members m on m.id = a.member_id
      order by a.created_at desc, a.id limit 20 offset ((page_number - 1)::bigint * 20)
    ) a), '[]'::jsonb)) into result;
  return result;
end;
$$;

create function public.membership_decide(application_id uuid, decision text, existing_code text default '')
returns text language plpgsql security definer set search_path = ''
as $$
declare a xenopouleio_private.applications; m xenopouleio_private.members; next_code text;
begin
  if not public.is_site_admin() then raise exception 'Administrator required' using errcode = '42501'; end if;
  if decision is null or decision not in ('approve','reject') or existing_code is null then
    raise exception 'Invalid decision' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(40601017);
  select * into a from xenopouleio_private.applications where id = application_id for update;
  if not found then raise exception 'Application changed' using errcode = '40001'; end if;
  if a.member_id is not null then raise exception 'Already approved' using errcode = '40001'; end if;
  if decision = 'reject' then
    delete from xenopouleio_private.applications where id = application_id;
    return '';
  end if;
  if btrim(existing_code) <> '' then
    select * into m from xenopouleio_private.members where member_code = btrim(existing_code) for update;
    if not found or m.auth_user_id is not null
      or exists (select 1 from xenopouleio_private.applications where member_id = m.id) then
      raise exception 'Member unavailable for linking' using errcode = '22023';
    end if;
  else
    select (coalesce(max(member_code::numeric), 0) + 1)::text into next_code from xenopouleio_private.members;
    insert into xenopouleio_private.members(member_code, surname)
      values (next_code, a.full_name) returning * into m;
  end if;
  update xenopouleio_private.applications set member_id = m.id, approved_at = now() where id = a.id;
  return m.member_code;
end;
$$;

-- Used only by the server-side invitation function; never granted to browser roles.
create function public.membership_invitation(application_id uuid, account_id uuid default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare a xenopouleio_private.applications; result jsonb;
begin
  select * into a from xenopouleio_private.applications where id = application_id and member_id is not null for update;
  if not found then raise exception 'Approved application required' using errcode = '22023'; end if;
  if account_id is not null then
    if not exists (select 1 from auth.users u where u.id = account_id and lower(u.email) = a.email)
      or exists (select 1 from public.site_administrators where user_id = account_id) then
      raise exception 'Account mismatch' using errcode = '42501';
    end if;
    update xenopouleio_private.members set auth_user_id = account_id where id = a.member_id
      and (auth_user_id is null or auth_user_id = account_id);
    if not found then raise exception 'Account already linked' using errcode = '40001'; end if;
  end if;
  select jsonb_build_object('email', a.email, 'full_name', a.full_name, 'member_code', m.member_code)
    into result from xenopouleio_private.members m where m.id = a.member_id;
  return result;
end;
$$;

create function public.member_account()
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare m xenopouleio_private.members; result jsonb;
begin
  select * into m from xenopouleio_private.members where auth_user_id = auth.uid();
  if not found then raise exception 'Approved member required' using errcode = '42501'; end if;
  perform set_config('response.headers', '[{"Cache-Control":"no-store"}]', true);
  select jsonb_build_object('member_code', m.member_code,
    'full_name', (select full_name from xenopouleio_private.applications where member_id = m.id),
    'loans', coalesce((select jsonb_agg(to_jsonb(l) order by l.borrowed_at desc) from (
      select l.id, l.book_id, b.title, b.classification_code, l.borrowed_at, l.returned_at
      from xenopouleio_private.loans l join public.library_books b on b.id = l.book_id
      where l.member_id = m.id order by l.returned_at nulls first, l.borrowed_at desc limit 100
    ) l), '[]'::jsonb),
    'requests', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc) from (
      select r.id, b.title, r.state, r.created_at from xenopouleio_private.loan_requests r
      join public.library_books b on b.id = r.book_id where r.member_id = m.id and r.state = 'pending'
      order by r.created_at desc limit 20
    ) r), '[]'::jsonb)) into result;
  return result;
end;
$$;

create function public.member_request(book_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare member uuid;
begin
  select id into member from xenopouleio_private.members where auth_user_id = auth.uid() for update;
  if not found then raise exception 'Approved member required' using errcode = '42501'; end if;
  if (select count(*) from xenopouleio_private.loan_requests r where r.member_id = member and state = 'pending') >= 20 then
    raise exception 'Too many requests' using errcode = '54000';
  end if;
  perform 1 from public.library_books b where b.id = book_id and status = 'available' for update;
  if not found then raise exception 'Book not available' using errcode = '40001'; end if;
  insert into xenopouleio_private.loan_requests(member_id, book_id) values (member, book_id)
    on conflict do nothing;
end;
$$;

create function public.member_cancel(request_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  update xenopouleio_private.loan_requests r set state = 'cancelled'
    where r.id = request_id and r.state = 'pending' and exists (
      select 1 from xenopouleio_private.members m where m.id = r.member_id and m.auth_user_id = auth.uid()
    );
  if not found then raise exception 'Request unavailable' using errcode = '42501'; end if;
end;
$$;

create function public.lending_list(list_kind text default 'requests', page_number integer default 1)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare result jsonb;
begin
  if not public.is_site_admin() then raise exception 'Administrator required' using errcode = '42501'; end if;
  if list_kind is null or list_kind not in ('requests','loans') or page_number is null or page_number not between 1 and 100000 then
    raise exception 'Invalid list' using errcode = '22023';
  end if;
  perform set_config('response.headers', '[{"Cache-Control":"no-store"}]', true);
  with records as (
    select r.id, r.member_id, r.book_id, r.created_at as date from xenopouleio_private.loan_requests r
      where list_kind = 'requests' and r.state = 'pending'
    union all
    select l.id, l.member_id, l.book_id, l.borrowed_at from xenopouleio_private.loans l
      where list_kind = 'loans' and l.returned_at is null
  )
  select jsonb_build_object('total', (select count(*) from records),
    'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.date, i.id) from (
      select r.*, b.title, b.classification_code, b.status, m.member_code, m.surname, m.given_name
      from records r join public.library_books b on b.id = r.book_id join xenopouleio_private.members m on m.id = r.member_id
      order by r.date, r.id limit 20 offset ((page_number - 1)::bigint * 20)
    ) i), '[]'::jsonb)) into result;
  return result;
end;
$$;

create function public.lending_checkout(book_id uuid, member_code text, request_id uuid default null)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare m uuid; saved uuid;
begin
  if not public.is_site_admin() then raise exception 'Administrator required' using errcode = '42501'; end if;
  select id into m from xenopouleio_private.members where members.member_code = lending_checkout.member_code;
  if not found then raise exception 'Member not found' using errcode = '22023'; end if;
  perform 1 from public.library_books b where b.id = book_id and status = 'available' for update;
  if not found then raise exception 'Book not available' using errcode = '40001'; end if;
  if request_id is not null then
    update xenopouleio_private.loan_requests r set state = 'fulfilled'
      where r.id = request_id and r.book_id = lending_checkout.book_id and r.member_id = m and r.state = 'pending';
    if not found then raise exception 'Request changed' using errcode = '40001'; end if;
  end if;
  insert into xenopouleio_private.loans(member_id, book_id, administrator_id)
    values (m, book_id, auth.uid()) returning id into saved;
  update public.library_books set status = 'borrowed', version = version + 1 where id = book_id;
  return saved;
end;
$$;

create function public.lending_return(loan_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare target_book uuid;
begin
  if not public.is_site_admin() then raise exception 'Administrator required' using errcode = '42501'; end if;
  select book_id into target_book from xenopouleio_private.loans where id = loan_id;
  perform 1 from public.library_books where id = target_book for update;
  update xenopouleio_private.loans set returned_at = now() where id = loan_id and returned_at is null;
  if not found then raise exception 'Loan changed' using errcode = '40001'; end if;
  update public.library_books set status = 'available', version = version + 1 where id = target_book;
end;
$$;

create function public.lending_reject(request_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_site_admin() then raise exception 'Administrator required' using errcode = '42501'; end if;
  update xenopouleio_private.loan_requests set state = 'cancelled' where id = request_id and state = 'pending';
  if not found then raise exception 'Request changed' using errcode = '40001'; end if;
end;
$$;

revoke all on function public.membership_apply(jsonb) from public;
grant execute on function public.membership_apply(jsonb) to anon, authenticated;
revoke all on function public.membership_invitation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.membership_invitation(uuid, uuid) to service_role;
revoke all on function public.membership_applications(integer), public.membership_decide(uuid,text,text),
  public.member_account(), public.member_request(uuid), public.member_cancel(uuid),
  public.lending_list(text,integer), public.lending_checkout(uuid,text,uuid), public.lending_return(uuid),
  public.lending_reject(uuid) from public, anon;
grant execute on function public.membership_applications(integer), public.membership_decide(uuid,text,text),
  public.member_account(), public.member_request(uuid), public.member_cancel(uuid),
  public.lending_list(text,integer), public.lending_checkout(uuid,text,uuid), public.lending_return(uuid),
  public.lending_reject(uuid) to authenticated;
commit;

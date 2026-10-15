begin;

create extension if not exists unaccent with schema extensions;

create function public.library_normalize(value text)
returns text language sql stable set search_path = ''
as $$
  select regexp_replace(replace(lower(extensions.unaccent(coalesce(value, ''))), 'ς', 'σ'), '[^[:alnum:]]+', ' ', 'g');
$$;
revoke all on function public.library_normalize(text) from public;
grant execute on function public.library_normalize(text) to anon, authenticated;

create table public.library_books (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 2000),
  author text not null default '' check (length(author) <= 2000),
  publisher text not null default '' check (length(publisher) <= 1000),
  publication_year text not null default '' check (length(publication_year) <= 200),
  publication_place text not null default '' check (length(publication_place) <= 500),
  page_count text not null default '' check (length(page_count) <= 200),
  catalog_number text not null default '' check (length(catalog_number) <= 200),
  classification_code text not null default '' check (length(classification_code) <= 10000),
  status text not null default 'unverified' check (status in ('unverified', 'unavailable')),
  source_sheet text,
  source_row integer,
  version integer not null default 1,
  unique (source_sheet, source_row)
);
alter table public.library_books enable row level security;
revoke all on public.library_books from anon, authenticated;
grant select on public.library_books to anon, authenticated;
create policy "Public bibliographic catalog" on public.library_books for select to anon, authenticated using (true);

create table public.library_review (
  id uuid primary key default gen_random_uuid(),
  source_sheet text not null,
  source_row integer not null,
  title text not null,
  author text not null default '',
  publisher text not null default '',
  publication_year text not null default '',
  publication_place text not null default '',
  page_count text not null default '',
  catalog_number text not null default '',
  classification_code text not null default '',
  decision text not null default 'pending' check (decision in ('pending', 'reference', 'linked', 'added', 'dismissed')),
  book_id uuid references public.library_books(id) on delete set null,
  version integer not null default 1,
  unique (source_sheet, source_row)
);
alter table public.library_review enable row level security;
revoke all on public.library_review from anon, authenticated;
grant select on public.library_review to authenticated;
create policy "Only administrators read helper sheets" on public.library_review for select to authenticated using (public.is_site_admin());

-- Temporary, private staging for the sanitized TSV; drop after the verified import.
create table public.library_import (
  kind text not null check (kind in ('main', 'helper')),
  payload jsonb not null
);
alter table public.library_import enable row level security;
revoke all on public.library_import from anon, authenticated;

create function public.library_search(search_term text default '', page_number integer default 1, page_size integer default 20)
returns jsonb language plpgsql stable security invoker set search_path = ''
as $$
declare result jsonb;
begin
  if search_term is null or length(search_term) > 200 or page_number is null or page_number < 1
    or page_number > 100000 or page_size is null or page_size < 1 or page_size > 50 then
    raise exception 'Invalid search parameters' using errcode = '22023';
  end if;
  with matches as materialized (
    select b.* from public.library_books b
    where not exists (
      select 1 from regexp_split_to_table(trim(public.library_normalize(search_term)), '\s+') word
      where word <> '' and position(word in public.library_normalize(
        b.title || ' ' || b.author || ' ' || b.publisher || ' ' || b.catalog_number || ' ' || b.classification_code
      )) = 0
    )
  ), items as (
    select * from matches order by title collate "C", id
    limit page_size offset ((page_number - 1)::bigint * page_size)
  )
  select jsonb_build_object('total', (select count(*) from matches),
    'items', coalesce((select jsonb_agg(to_jsonb(items) order by title collate "C", id) from items), '[]'::jsonb))
  into result;
  return result;
end;
$$;
revoke all on function public.library_search(text, integer, integer) from public;
grant execute on function public.library_search(text, integer, integer) to anon, authenticated;

create function public.library_save(book_data jsonb, book_id uuid default null, expected_version integer default null, review_id uuid default null)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare saved_id uuid; review_row public.library_review;
begin
  if not public.is_site_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if book_data is null or jsonb_typeof(book_data) <> 'object'
    or not (book_data ? 'title') or jsonb_typeof(book_data->'title') <> 'string'
    or exists (select 1 from jsonb_each(book_data) e where jsonb_typeof(e.value) <> 'string') then
    raise exception 'Invalid book data' using errcode = '22023';
  end if;
  if review_id is not null then
    select * into review_row from public.library_review where id = review_id for update;
    if not found or review_row.decision <> 'pending' or book_id is not null then
      raise exception 'Review record changed. Reload.' using errcode = '40001';
    end if;
  end if;
  if book_id is null then
    insert into public.library_books (title, author, publisher, publication_year, publication_place,
      page_count, catalog_number, classification_code, status, source_sheet, source_row)
    values (book_data->>'title', coalesce(book_data->>'author', ''), coalesce(book_data->>'publisher', ''),
      coalesce(book_data->>'publication_year', ''), coalesce(book_data->>'publication_place', ''),
      coalesce(book_data->>'page_count', ''), coalesce(book_data->>'catalog_number', ''),
      coalesce(book_data->>'classification_code', ''), coalesce(book_data->>'status', 'unverified'),
      review_row.source_sheet, review_row.source_row)
    returning id into saved_id;
  else
    update public.library_books b set title = book_data->>'title',
      author = coalesce(book_data->>'author', ''), publisher = coalesce(book_data->>'publisher', ''),
      publication_year = coalesce(book_data->>'publication_year', ''), publication_place = coalesce(book_data->>'publication_place', ''),
      page_count = coalesce(book_data->>'page_count', ''), catalog_number = coalesce(book_data->>'catalog_number', ''),
      classification_code = coalesce(book_data->>'classification_code', ''), status = coalesce(book_data->>'status', 'unverified'),
      version = b.version + 1
    where b.id = book_id and b.version = expected_version returning b.id into saved_id;
    if not found then raise exception 'Book changed. Reload.' using errcode = '40001'; end if;
  end if;
  if review_id is not null then
    update public.library_review set decision = 'added', book_id = saved_id, version = version + 1 where id = review_id;
  end if;
  return saved_id;
end;
$$;
revoke all on function public.library_save(jsonb, uuid, integer, uuid) from public;
grant execute on function public.library_save(jsonb, uuid, integer, uuid) to authenticated;

create function public.library_resolve(review_id uuid, expected_version integer, resolution text, target_book uuid default null)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_site_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  if resolution is null or resolution not in ('linked', 'dismissed') or (resolution = 'linked' and target_book is null)
    or (resolution = 'dismissed' and target_book is not null) then
    raise exception 'Invalid review decision' using errcode = '22023';
  end if;
  update public.library_review set decision = resolution, book_id = target_book, version = version + 1
    where id = review_id and version = expected_version and decision = 'pending';
  if not found then raise exception 'Review record changed. Reload.' using errcode = '40001'; end if;
end;
$$;
revoke all on function public.library_resolve(uuid, integer, text, uuid) from public;
grant execute on function public.library_resolve(uuid, integer, text, uuid) to authenticated;

create function public.library_delete(book_id uuid, expected_version integer)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_site_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  delete from public.library_books where id = book_id and version = expected_version;
  if not found then raise exception 'Book changed. Reload.' using errcode = '40001'; end if;
end;
$$;
revoke all on function public.library_delete(uuid, integer) from public;
grant execute on function public.library_delete(uuid, integer) to authenticated;

commit;

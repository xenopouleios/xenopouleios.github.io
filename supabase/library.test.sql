begin;

insert into public.library_review (id, source_sheet, source_row, title)
values ('00000000-0000-0000-0000-000000000001', 'transaction-test', 1, 'TEST helper'),
  ('00000000-0000-0000-0000-000000000002', 'transaction-test', 2, 'TEST new helper');

select set_config('request.jwt.claim.sub', (select user_id::text from public.site_administrators limit 1), true);
set local role authenticated;
do $$
declare book uuid; document jsonb; stale boolean := false;
begin
  if not public.is_site_admin() then raise exception 'Missing test administrator'; end if;
  if (select count(*) from public.library_review) < 1 then raise exception 'Admin review read failed'; end if;
  document := '{"title":"TEST Greek Τόνος κόσμος","author":"Δοκιμή","status":"unverified"}';
  book := public.library_save(document);
  if not exists (select 1 from public.library_books where id = book and version = 1) then raise exception 'Insert failed'; end if;
  perform public.library_save(document || '{"title":"TEST edited"}', book, 1);
  begin
    perform public.library_save(document, book, 1);
  exception when serialization_failure then stale := true;
  end;
  if not stale then raise exception 'Stale edit accepted'; end if;
  perform public.library_resolve('00000000-0000-0000-0000-000000000001', 1, 'linked', book);
  if not exists (select 1 from public.library_review where id = '00000000-0000-0000-0000-000000000001' and decision = 'linked') then
    raise exception 'Link review failed';
  end if;
  stale := false;
  begin
    perform public.library_resolve('00000000-0000-0000-0000-000000000001', 1, 'dismissed');
  exception when serialization_failure then stale := true;
  end;
  if not stale then raise exception 'Stale review accepted'; end if;
  perform public.library_delete(book, 2);
  if exists (select 1 from public.library_books where id = book) then raise exception 'Delete failed'; end if;
  book := public.library_save(document, null, null, '00000000-0000-0000-0000-000000000002');
  if not exists (select 1 from public.library_review where id = '00000000-0000-0000-0000-000000000002' and decision = 'added' and book_id = book) then
    raise exception 'Approval did not link the private source';
  end if;
  if not exists (select 1 from public.library_books where id = book and source_sheet = 'transaction-test' and source_row = 2) then
    raise exception 'Approval lost provenance';
  end if;
  perform public.library_delete(book, 1);
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000099', true);
do $$
declare denied boolean := false;
begin
  if exists (select 1 from public.library_review) then raise exception 'Non-admin read private review'; end if;
  begin
    perform public.library_save('{"title":"not allowed"}');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Non-admin wrote a book'; end if;
end;
$$;

set local role anon;
do $$
declare denied boolean := false; result jsonb;
begin
  result := public.library_search('', 1, 20);
  if jsonb_array_length(result->'items') <> 20 or (result->>'total')::integer <> 7861 then
    raise exception 'Public count/page shape failed';
  end if;
  result := public.library_search('', 394, 20);
  if jsonb_array_length(result->'items') <> 1 then raise exception 'Last catalog page failed'; end if;
  if public.library_normalize('Τόνος Κόσμος') <> public.library_normalize('τονοσ κοσμοσ') then
    raise exception 'Greek normalization failed';
  end if;
  begin
    perform count(*) from public.library_review;
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Anonymous read private review'; end if;
  denied := false;
  begin
    insert into public.library_books(title) values ('not allowed');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Anonymous wrote a book'; end if;
end;
$$;

rollback;
select 'Catalog tests passed; all test changes rolled back' as result;

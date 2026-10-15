begin;
do $$
begin
  if (select count(*) from public.library_import where kind = 'main') <> 7861
     or (select count(*) from public.library_import where kind = 'helper') <> 16725 then
    raise exception 'Unexpected staging counts. Import cancelled.';
  end if;
  if (select md5(string_agg(
    concat_ws(chr(31), payload->>'id', payload->>'title', payload->>'author',
      payload->>'publisher', payload->>'publication_year', payload->>'publication_place',
      payload->>'page_count', payload->>'catalog_number', payload->>'classification_code',
      coalesce(payload->>'status', ''), payload->>'source_sheet', payload->>'source_row',
      coalesce(payload->>'decision', ''), coalesce(payload->>'book_id', '')),
    chr(30) order by payload->>'id' collate "C")) from public.library_import)
    is distinct from '5be32854adf7bcfb6f1040aac11d572b' then
    raise exception 'Bibliographic checksum mismatch. Import cancelled.';
  end if;
end;
$$;

insert into public.library_books (id, title, author, publisher, publication_year, publication_place,
  page_count, catalog_number, classification_code, status, source_sheet, source_row)
select (payload->>'id')::uuid, payload->>'title', payload->>'author', payload->>'publisher',
  payload->>'publication_year', payload->>'publication_place', payload->>'page_count',
  payload->>'catalog_number', payload->>'classification_code', payload->>'status',
  payload->>'source_sheet', (payload->>'source_row')::integer
from public.library_import where kind = 'main';

insert into public.library_review (id, title, author, publisher, publication_year, publication_place,
  page_count, catalog_number, classification_code, source_sheet, source_row, decision, book_id)
select (payload->>'id')::uuid, payload->>'title', payload->>'author', payload->>'publisher',
  payload->>'publication_year', payload->>'publication_place', payload->>'page_count',
  payload->>'catalog_number', payload->>'classification_code',
  payload->>'source_sheet', (payload->>'source_row')::integer, payload->>'decision', (payload->>'book_id')::uuid
from public.library_import where kind = 'helper';

do $$
begin
  if (select count(*) from public.library_books) <> 7861
     or (select count(*) from public.library_review) <> 16725
     or (select count(*) from public.library_review where decision = 'pending') <> 131 then
    raise exception 'Unexpected catalog counts. Import cancelled.';
  end if;
end;
$$;
drop table public.library_import;
commit;

select source_sheet, count(*) from public.library_books group by source_sheet;
select source_sheet, decision, count(*) from public.library_review group by source_sheet, decision order by source_sheet, decision;

begin;
select set_config('request.jwt.claim.sub', (select user_id::text from public.site_administrators limit 1), true);
set local role authenticated;

do $$
declare saved uuid; result jsonb; denied boolean; original_count integer;
begin
  result := public.members_search();
  original_count := (result->>'total')::integer;
  if original_count <> 4060 or jsonb_array_length(result->'items') <> 20 then
    raise exception 'Member count or first page shape failed';
  end if;
  if jsonb_array_length(public.members_search('', 203)->'items') <> 20
    or jsonb_array_length(public.members_search('', 204)->'items') <> 0 then
    raise exception 'Full registry pagination failed';
  end if;
  saved := public.members_save('{"member_code":"99999999999999999999","surname":"ΔΟΚΙΜΗ ΤΌΝΟΣ","given_name":"Synthetic only"}');
  result := public.members_search('δοκιμη τονοσ');
  if not exists (select 1 from jsonb_array_elements(result->'items') item where item->>'id' = saved::text) then
    raise exception 'Greek member search failed';
  end if;
  denied := false;
  begin
    perform public.members_save('{"member_code":"99999999999999999999","surname":"","given_name":""}');
  exception when unique_violation then denied := true;
  end;
  if not denied then raise exception 'Duplicate member code accepted'; end if;
  perform public.members_save('{"member_code":"99999999999999999999","surname":"","given_name":"2000"}', saved, 1);
  result := public.members_search('99999999999999999999', 1, true);
  if (result->>'total')::integer <> 1 or not (result->'items'->0->>'needs_review')::boolean then
    raise exception 'Incomplete member review failed';
  end if;
  denied := false;
  begin
    perform public.members_save('{"member_code":"99999999999999999999","surname":"","given_name":""}', saved, 1);
  exception when serialization_failure then denied := true;
  end;
  if not denied then raise exception 'Stale member edit accepted'; end if;
  denied := false;
  begin
    perform public.members_delete(saved, 1);
  exception when serialization_failure then denied := true;
  end;
  if not denied then raise exception 'Stale member deletion accepted'; end if;
  perform public.members_delete(saved, 2);
  if (public.members_search()->>'total')::integer <> original_count then raise exception 'Delete failed'; end if;
  denied := false;
  begin
    perform public.members_save('{"member_code":"BAD","surname":"","given_name":""}');
  exception when invalid_parameter_value then denied := true;
  end;
  if not denied then raise exception 'Invalid member code accepted'; end if;
  denied := false;
  begin
    perform count(*) from xenopouleio_private.members;
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Direct access bypassed private schema'; end if;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000099', true);
do $$
declare denied boolean; operation integer;
begin
  for operation in 1..3 loop
    denied := false;
    begin
      if operation = 1 then perform public.members_search();
      elsif operation = 2 then perform public.members_save('{"member_code":"99999999999999999999","surname":"","given_name":""}');
      else perform public.members_delete('00000000-0000-0000-0000-000000000001', 1);
      end if;
    exception when insufficient_privilege then denied := true;
    end;
    if not denied then raise exception 'Non-administrator accessed member operation %', operation; end if;
  end loop;
end;
$$;
set local role anon;
do $$
declare denied boolean; operation integer;
begin
  for operation in 1..4 loop
    denied := false;
    begin
      if operation = 1 then perform public.members_search();
      elsif operation = 2 then perform public.members_save('{"member_code":"99999999999999999999","surname":"","given_name":""}');
      elsif operation = 3 then perform public.members_delete('00000000-0000-0000-0000-000000000001', 1);
      else perform count(*) from xenopouleio_private.members;
      end if;
    exception when insufficient_privilege then denied := true;
    end;
    if not denied then raise exception 'Anonymous accessed member operation %', operation; end if;
  end loop;
end;
$$;
rollback;
select 'Member CRUD, privacy, concurrency and pagination tests passed; test data rolled back' as result;

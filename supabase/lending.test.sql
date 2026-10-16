begin;
create temporary table lending_test_ids(key text primary key, id uuid);
grant all on lending_test_ids to authenticated, anon, service_role;
insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-000000001016', 'lending-test@example.test'),
  ('00000000-0000-0000-0000-000000001017', 'other-lending-test@example.test');

set local role anon;
select public.membership_apply('{"full_name":"Synthetic Member","guardian_name":"","is_minor":false,"phone":"1234567890","email":"lending-test@example.test","address":"Synthetic address","identity_number":"TEST-ONLY"}');
select public.membership_apply('{"full_name":"Other Synthetic Member","guardian_name":"","is_minor":false,"phone":"1234567890","email":"other-lending-test@example.test","address":"Synthetic address","identity_number":"TEST-ONLY"}');
select public.membership_apply('{"full_name":"Synthetic Member","guardian_name":"","is_minor":false,"phone":"1234567890","email":"lending-test@example.test","address":"Synthetic address","identity_number":"TEST-ONLY"}');
do $$
declare denied boolean := false;
begin
  begin perform public.member_account(); exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Anonymous account access'; end if;
  denied := false;
  begin perform count(*) from xenopouleio_private.applications; exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Anonymous private application access'; end if;
  denied := false;
  begin perform public.membership_apply('{"full_name":"Test","guardian_name":"","is_minor":true,"phone":"1234567890","email":"minor-test@example.test","address":"Test address","identity_number":"TEST"}');
  exception when check_violation then denied := true; end;
  if not denied then raise exception 'Minor accepted without guardian'; end if;
end;
$$;
reset role;
insert into lending_test_ids values ('application', (select id from xenopouleio_private.applications where email = 'lending-test@example.test'));
insert into lending_test_ids values ('other-application', (select id from xenopouleio_private.applications where email = 'other-lending-test@example.test'));
select set_config('request.jwt.claim.sub', (select user_id::text from public.site_administrators limit 1), true);
set local role authenticated;
select public.membership_decide((select id from lending_test_ids where key = 'application'), 'approve');
select public.membership_decide((select id from lending_test_ids where key = 'other-application'), 'approve');
insert into lending_test_ids values ('book', public.library_save('{"title":"SYNTHETIC LENDING TEST","status":"available"}'));
reset role;
insert into lending_test_ids values ('member', (select member_id from xenopouleio_private.applications where email = 'lending-test@example.test'));
set local role service_role;
select public.membership_invitation((select id from lending_test_ids where key = 'application'), '00000000-0000-0000-0000-000000001016');
select public.membership_invitation((select id from lending_test_ids where key = 'other-application'), '00000000-0000-0000-0000-000000001017');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001016', true);
set local role authenticated;
select public.member_request((select id from lending_test_ids where key = 'book'));
select public.member_request((select id from lending_test_ids where key = 'book'));
do $$
declare result jsonb; denied boolean;
begin
  result := public.member_account();
  if jsonb_array_length(result->'requests') <> 1 or jsonb_array_length(result->'loans') <> 0 then
    raise exception 'Request not idempotent or created premature loan';
  end if;
  denied := false;
  begin perform public.membership_applications(); exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Member read applications'; end if;
  denied := false;
  begin perform public.lending_list(); exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Member read lending admin'; end if;
  denied := false;
  begin perform public.membership_invitation((select id from lending_test_ids where key = 'application')); exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Member generated invitation'; end if;
end;
$$;
reset role;
insert into lending_test_ids values ('request', (select id from xenopouleio_private.loan_requests where member_id = (select id from lending_test_ids where key = 'member')));
select set_config('request.jwt.claim.sub', (select user_id::text from public.site_administrators limit 1), true);
set local role authenticated;
insert into lending_test_ids values ('loan', public.lending_checkout(
  (select id from lending_test_ids where key = 'book'),
  (select item->>'member_code' from jsonb_array_elements(public.membership_applications()->'items') item
    where item->>'id' = (select id::text from lending_test_ids where key = 'application')),
  (select id from lending_test_ids where key = 'request')));
do $$
declare denied boolean := false;
begin
  if (select status from public.library_books where id = (select id from lending_test_ids where key = 'book')) <> 'borrowed' then
    raise exception 'Checkout did not change public availability';
  end if;
  begin perform public.library_save('{"title":"SYNTHETIC LENDING TEST","status":"available"}', (select id from lending_test_ids where key = 'book'), 2);
  exception when check_violation then denied := true; end;
  if not denied then raise exception 'Active loan bypassed by book edit'; end if;
  denied := false;
  begin perform public.lending_checkout(
    (select id from lending_test_ids where key = 'book'),
    (select item->>'member_code' from jsonb_array_elements(public.membership_applications()->'items') item
      where item->>'id' = (select id::text from lending_test_ids where key = 'application')));
  exception when serialization_failure then denied := true; end;
  if not denied then raise exception 'Duplicate checkout accepted'; end if;
end;
$$;
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001016', true);
set local role authenticated;
do $$
declare denied boolean := false;
begin
  if jsonb_array_length(public.member_account()->'loans') <> 1 then raise exception 'Own loan missing'; end if;
  begin perform public.lending_return((select id from lending_test_ids where key = 'loan'));
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Member self-return accepted'; end if;
end;
$$;
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001017', true);
set local role authenticated;
do $$
declare denied boolean := false;
begin
  if jsonb_array_length(public.member_account()->'loans') <> 0 then raise exception 'Other member saw private loans'; end if;
  denied := false;
  begin perform public.member_cancel((select id from lending_test_ids where key = 'request'));
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Other user cancelled request'; end if;
end;
$$;
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001018', true);
set local role authenticated;
do $$
declare denied boolean := false;
begin
  begin perform public.member_account(); exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Unapproved user accessed account'; end if;
end;
$$;
reset role;
select set_config('request.jwt.claim.sub', (select user_id::text from public.site_administrators limit 1), true);
set local role authenticated;
select public.lending_return((select id from lending_test_ids where key = 'loan'));
do $$
declare denied boolean := false;
begin
  if (select status from public.library_books where id = (select id from lending_test_ids where key = 'book')) <> 'available' then
    raise exception 'Return did not restore public availability';
  end if;
  begin perform public.lending_return((select id from lending_test_ids where key = 'loan'));
  exception when serialization_failure then denied := true; end;
  if not denied then raise exception 'Duplicate return accepted'; end if;
end;
$$;
reset role;
rollback;
select 'Application, privacy, approval, member request, checkout and return tests passed; synthetic data rolled back' as result;

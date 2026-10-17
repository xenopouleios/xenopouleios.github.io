begin;

create table if not exists public.contact_email_rate_limits (
  ip_hash text primary key,
  window_started_at timestamptz not null default now(),
  request_count smallint not null default 1 check (request_count > 0)
);
alter table public.contact_email_rate_limits enable row level security;
revoke all on public.contact_email_rate_limits from public, anon, authenticated;

create or replace function public.allow_contact_email(request_ip_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed boolean;
begin
  if request_ip_hash is null or length(request_ip_hash) <> 64 then
    return false;
  end if;

  delete from public.contact_email_rate_limits
  where window_started_at < now() - interval '1 day';

  insert into public.contact_email_rate_limits (ip_hash)
  values (request_ip_hash)
  on conflict (ip_hash) do update
  set
    window_started_at = case
      when public.contact_email_rate_limits.window_started_at < now() - interval '1 hour' then now()
      else public.contact_email_rate_limits.window_started_at
    end,
    request_count = case
      when public.contact_email_rate_limits.window_started_at < now() - interval '1 hour' then 1
      else least(public.contact_email_rate_limits.request_count + 1, 32767)::smallint
    end
  returning request_count <= 5 into allowed;

  return allowed;
end;
$$;
revoke all on function public.allow_contact_email(text) from public, anon, authenticated;
grant execute on function public.allow_contact_email(text) to service_role;

commit;

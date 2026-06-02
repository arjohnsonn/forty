set search_path = public;

-- Per-user monthly AI usage, metered in USD by the chat Worker. One row per user per calendar
-- month (UTC); spend accumulates within a month and a new month starts fresh (no reset job needed).
create table if not exists public.user_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  period text not null,                        -- 'YYYY-MM' (UTC)
  spent_usd numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, period)
);

alter table public.user_usage enable row level security;

-- Users may READ their own usage (for a future "X left" display). Writes go only through the
-- SECURITY DEFINER functions below, so a user can't reset or under-report their own spend.
drop policy if exists user_usage_read_own on public.user_usage;
create policy user_usage_read_own on public.user_usage
  for select to authenticated using ((select auth.uid()) = user_id);

-- Add to the caller's current-month spend (clamped non-negative).
create or replace function public.record_usage(p_cost numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_usage (user_id, period, spent_usd, updated_at)
  values (
    auth.uid(),
    to_char(now() at time zone 'utc', 'YYYY-MM'),
    greatest(p_cost, 0),
    now()
  )
  on conflict (user_id, period)
  do update set spent_usd = public.user_usage.spent_usd + greatest(p_cost, 0),
                updated_at = now();
end;
$$;

grant execute on function public.record_usage(numeric) to authenticated;

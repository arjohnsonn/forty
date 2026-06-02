set search_path = public;

-- Pro entitlement: a one-time semester pass sets pro_until to the term's end date.
-- null (or a past date) = Free. Written only by the Stripe webhook (service role).
create table if not exists public.user_plan (
  user_id uuid not null references auth.users (id) on delete cascade,
  pro_until date,
  stripe_customer_id text,
  updated_at timestamptz not null default now(),
  primary key (user_id)
);

alter table public.user_plan enable row level security;

-- Users may read their own plan (for the Account → Plan display). The webhook writes via the
-- service role, which bypasses RLS, so no user-facing write policy exists.
drop policy if exists user_plan_read_own on public.user_plan;
create policy user_plan_read_own on public.user_plan
  for select to authenticated using ((select auth.uid()) = user_id);

-- Current-month spend + Pro status in one call, for the chat Worker's budget decision.
create or replace function public.usage_status()
returns table (spent_usd numeric, is_pro boolean)
language sql
security definer
set search_path = public
as $$
  select
    coalesce((
      select spent_usd from public.user_usage
      where user_id = auth.uid()
        and period = to_char(now() at time zone 'utc', 'YYYY-MM')
    ), 0) as spent_usd,
    coalesce((
      select pro_until >= (now() at time zone 'utc')::date
      from public.user_plan where user_id = auth.uid()
    ), false) as is_pro;
$$;

grant execute on function public.usage_status() to authenticated;

set search_path = public;

-- Pay-what-you-want prepaid credit balance (retail USD): usage debits it, Stripe top-ups add to it.
create table if not exists public.user_credits (
  user_id uuid primary key references auth.users (id) on delete cascade,
  balance_usd numeric not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.user_credits enable row level security;

-- Users may read their own balance. Writes go only through the SECURITY DEFINER functions below.
drop policy if exists user_credits_read_own on public.user_credits;
create policy user_credits_read_own on public.user_credits
  for select to authenticated using ((select auth.uid()) = user_id);

-- Caller's balance, granting the one-time free-trial credit on first call.
create or replace function public.credit_balance()
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare bal numeric;
begin
  insert into public.user_credits (user_id, balance_usd)
  values (auth.uid(), 0.25)               -- free trial credit
  on conflict (user_id) do nothing;
  select balance_usd into bal from public.user_credits where user_id = auth.uid();
  return coalesce(bal, 0);
end;
$$;

-- Debit the caller's balance by a (marked-up retail) amount, clamped at 0.
create or replace function public.debit_credit(p_cost numeric)
returns void
language sql
security definer
set search_path = public
as $$
  update public.user_credits
  set balance_usd = greatest(balance_usd - greatest(p_cost, 0), 0),
      updated_at = now()
  where user_id = auth.uid();
$$;

-- Ledger of credit changes per Stripe event (top-ups positive, refunds negative), so a webhook
-- retry can't apply the same event twice. payment_intent links a refund back to its top-up.
create table if not exists public.credit_grants (
  stripe_event_id text primary key,
  user_id uuid not null,
  amount_usd numeric not null,
  payment_intent text,
  created_at timestamptz not null default now()
);

-- RLS on with no policies: only the SECURITY DEFINER functions / service role touch this table.
alter table public.credit_grants enable row level security;

-- Add credit (called by the Stripe webhook). Idempotent per event: bumps the balance only once.
create or replace function public.add_credit(p_event text, p_user uuid, p_amount numeric, p_payment_intent text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.credit_grants (stripe_event_id, user_id, amount_usd, payment_intent)
  values (p_event, p_user, greatest(p_amount, 0), p_payment_intent)
  on conflict (stripe_event_id) do nothing;
  if not found then
    return;                                 -- already credited this event
  end if;
  insert into public.user_credits (user_id, balance_usd, updated_at)
  values (p_user, greatest(p_amount, 0), now())
  on conflict (user_id) do update
    set balance_usd = public.user_credits.balance_usd + greatest(p_amount, 0),
        updated_at = now();
end;
$$;

-- Claw back a refunded payment. Idempotent per refund event; finds the user via the original
-- top-up's payment_intent and deducts the refunded amount (clamped at 0).
create or replace function public.refund_credit(p_event text, p_payment_intent text, p_amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_user uuid;
begin
  select user_id into v_user from public.credit_grants
    where payment_intent = p_payment_intent and amount_usd > 0
    limit 1;
  if v_user is null then
    return;                                 -- no matching top-up to claw back
  end if;
  insert into public.credit_grants (stripe_event_id, user_id, amount_usd, payment_intent)
  values (p_event, v_user, -greatest(p_amount, 0), p_payment_intent)
  on conflict (stripe_event_id) do nothing;
  if not found then
    return;                                 -- already processed this refund
  end if;
  update public.user_credits
  set balance_usd = greatest(balance_usd - greatest(p_amount, 0), 0),
      updated_at = now()
  where user_id = v_user;
end;
$$;

grant execute on function public.credit_balance() to authenticated;
grant execute on function public.debit_credit(numeric) to authenticated;

-- Lock the crediting functions to the service role; PUBLIC gets EXECUTE by default, so revoke it.
revoke all on function public.add_credit(text, uuid, numeric, text) from public;
grant execute on function public.add_credit(text, uuid, numeric, text) to service_role;
revoke all on function public.refund_credit(text, text, numeric) from public;
grant execute on function public.refund_credit(text, text, numeric) to service_role;

-- Retire the old freemium/Pro model, now replaced by credits.
drop function if exists public.usage_status();
drop function if exists public.record_usage(numeric);
drop table if exists public.user_usage;
drop table if exists public.user_plan;

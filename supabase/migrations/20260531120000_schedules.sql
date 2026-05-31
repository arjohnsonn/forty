set search_path = public, extensions;

-- User-built course schedules (UTRP-style). Each row is one named schedule; `sections` is a
-- denormalized jsonb array of the courses added to it (see ScheduleSection in lib/courses.ts),
-- so the calendar renders without re-running any retrieval RPC.
create table public.schedules (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references auth.users not null default auth.uid(),
    name text not null,
    sections jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index on public.schedules(user_id);


-- Row Level Security Policies (mirrors public.conversations).
alter table public.schedules enable row level security;
create policy "Individuals can create schedules" on public.schedules
    for insert to authenticated
    with check ((select auth.uid()) = user_id);

create policy "Individuals can view their schedules" on public.schedules
    for select to authenticated
    using ((select auth.uid()) = user_id);

create policy "Individuals can update their schedules" on public.schedules
    for update to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

create policy "Individuals can delete their schedules" on public.schedules
    for delete to authenticated
    using ((select auth.uid()) = user_id);


-- Atomic section add/remove on the jsonb array so two tabs/devices can't lose an update via a
-- client read-modify-write. SECURITY INVOKER -> the table's RLS still scopes writes to the owner.
create or replace function public.add_section_to_schedule(p_id uuid, p_section jsonb)
returns void
language sql
security invoker
set search_path = public
as $$
    update public.schedules
    set sections = case
            when exists (
                select 1 from jsonb_array_elements(sections) e
                where (e->>'section_id')::bigint = (p_section->>'section_id')::bigint
            ) then sections
            else sections || jsonb_build_array(p_section)
        end,
        updated_at = now()
    where id = p_id;
$$;

create or replace function public.remove_section_from_schedule(p_id uuid, p_section_id bigint)
returns void
language sql
security invoker
set search_path = public
as $$
    update public.schedules
    set sections = coalesce((
            select jsonb_agg(e)
            from jsonb_array_elements(sections) e
            where (e->>'section_id')::bigint <> p_section_id
        ), '[]'::jsonb),
        updated_at = now()
    where id = p_id;
$$;


-- Enable realtime
alter publication supabase_realtime add table public.schedules;

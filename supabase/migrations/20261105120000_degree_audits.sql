set search_path = public, extensions;

-- One parsed degree audit + its generated plan per user (no name/EID: only requirements and course codes).
create table if not exists public.degree_audits (
    user_id uuid primary key references auth.users on delete cascade default auth.uid(),
    audit jsonb not null,
    result jsonb not null,
    updated_at timestamptz not null default now()
);

alter table public.degree_audits enable row level security;
drop policy if exists "Individuals can view their degree audit" on public.degree_audits;
create policy "Individuals can view their degree audit" on public.degree_audits
    for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Individuals can create their degree audit" on public.degree_audits;
create policy "Individuals can create their degree audit" on public.degree_audits
    for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Individuals can update their degree audit" on public.degree_audits;
create policy "Individuals can update their degree audit" on public.degree_audits
    for update to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);
drop policy if exists "Individuals can delete their degree audit" on public.degree_audits;
create policy "Individuals can delete their degree audit" on public.degree_audits
    for delete to authenticated using ((select auth.uid()) = user_id);

-- Offered courses matching explicit codes OR a subject/level/core pool, with ranking inputs and past offering seasons.
create or replace function public.audit_candidates(
    p_codes text[] default null,
    p_subjects text[] default null,
    p_level text default null,
    p_core text default null,
    p_limit int default 60
)
returns table (
    course_id         bigint,
    course_header     text,
    course_code       text,
    description       text,
    num_sections      int,
    instructors       text[],
    instruction_modes text[],
    core_curriculum   text[],
    grade_data        jsonb,
    ces_rating        float,
    rmp_rating        float,
    seasons           text[]
)
language sql stable set search_path = 'public' as $$
    with matched as (
        select c.id
        from public.courses c
        where exists (select 1 from public.sections s where s.course_id = c.id)
          and (
            (p_codes is not null and normalize_code(c.course_code) = any (
                select normalize_code(x) from unnest(p_codes) x
            ))
            or (
              (p_subjects is not null or p_core is not null)
              and (p_subjects is null or course_subject(c.course_code) = any (p_subjects))
              and (p_level is null or course_level(c.course_code) = p_level)
              and (p_core is null or exists (
                  select 1 from public.sections s
                  where s.course_id = c.id and p_core = any (s.core_curriculum)
              ))
            )
          )
    )
    select
        c.id,
        c.course_header,
        c.course_code,
        c.description,
        count(distinct s.id)::int,
        coalesce(array_agg(distinct i.name) filter (where i.name is not null), array[]::text[]),
        coalesce(array_agg(distinct s.instruction_mode) filter (where s.instruction_mode is not null), array[]::text[]),
        coalesce(array_agg(distinct cc) filter (where cc is not null and btrim(cc) <> ''), array[]::text[]),
        (array_agg(s.grade_data) filter (where s.grade_data is not null))[1],
        (select avg(e.instructor_rating)::float
           from public.evaluation_sections es
           join public.evaluations e on e.id = es.evaluation_id
           join public.sections s2 on s2.id = es.section_id
          where s2.course_id = c.id and e.instructor_rating > 0),
        (select avg(i2.rmp_rating)::float
           from public.instructors i2
          where i2.rmp_num_ratings > 0
            and i2.id in (
                select si2.instructor_id
                from public.section_instructors si2
                join public.sections s3 on s3.id = si2.section_id
                where s3.course_id = c.id
            )),
        coalesce((
            select array_agg(distinct split_part(cg.semester, ' ', 1))
            from public.course_grades cg
            where cg.course_code = c.course_code
        ), array[]::text[])
    from matched m
    join public.courses c on c.id = m.id
    join public.sections s on s.course_id = c.id
    left join public.section_instructors si on si.section_id = s.id
    left join public.instructors i on i.id = si.instructor_id
    left join lateral unnest(s.core_curriculum) as cc on true
    group by c.id
    order by c.course_code, c.course_header
    limit greatest(p_limit, 0);
$$;

-- Past offering seasons + latest catalog description for required courses that aren't on the current schedule.
drop function if exists public.course_seasons(text[]);
create or replace function public.course_seasons(p_codes text[])
returns table (course_code text, seasons text[], description text)
language sql stable set search_path = 'public' as $$
    select
        x as course_code,
        coalesce((
            select array_agg(distinct split_part(cg.semester, ' ', 1))
            from public.course_grades cg
            where normalize_code(cg.course_code) = normalize_code(x)
        ), array[]::text[]),
        (
            select c.description from public.courses c
            where normalize_code(c.course_code) = normalize_code(x) and c.description is not null
            order by c.id desc
            limit 1
        )
    from unnest(p_codes) x;
$$;

set search_path = public, extensions;

-- The crediting functions are for the Stripe webhook (service role) only; default privileges also granted them to anon/authenticated directly.
revoke execute on function public.add_credit(text, uuid, numeric, text) from anon, authenticated;
revoke execute on function public.refund_credit(text, text, numeric) from anon, authenticated;

-- Cap page sizes so a client can't request unbounded result sets.
create or replace function public.browse_courses(
  p_search text default null,
  p_subject text default null,
  p_level text default null,
  p_core text default null,
  p_limit int default 40,
  p_offset int default 0
)
returns table (
  course_id bigint,
  course_header text,
  course_code text,
  num_sections int,
  instructors text[],
  instruction_modes text[],
  core_curriculum text[],
  total_count bigint
)
language sql stable set search_path = 'public' as $$
  with base as (
    select
      c.id as course_id,
      c.course_header,
      c.course_code,
      count(distinct s.id)::int as num_sections,
      coalesce(array_agg(distinct i.name) filter (where i.name is not null), array[]::text[]) as instructors,
      coalesce(array_agg(distinct s.instruction_mode) filter (where s.instruction_mode is not null), array[]::text[]) as instruction_modes,
      coalesce(array_agg(distinct cc) filter (where cc is not null and btrim(cc) <> ''), array[]::text[]) as core_curriculum
    from public.courses c
    join public.sections s on s.course_id = c.id
    left join public.section_instructors si on si.section_id = s.id
    left join public.instructors i on i.id = si.instructor_id
    left join lateral unnest(s.core_curriculum) as cc on true
    group by c.id
  ),
  filtered as (
    select * from base
    where (
        p_search is null
        -- raw substring: titles ("calculus") and already-spaced codes ("C S 314")
        or course_header ilike '%' || p_search || '%'
        -- space/punctuation-insensitive code match: "cs 314" / "cs314" -> "cs314"
        or (
          normalize_code(p_search) <> ''
          and normalize_code(course_code) like '%' || normalize_code(p_search) || '%'
        )
      )
      and (p_subject is null or course_subject(course_code) = p_subject)
      and (p_level is null or course_level(course_code) = p_level)
      and (p_core is null or p_core = any(core_curriculum))
  )
  select
    course_id, course_header, course_code, num_sections,
    instructors, instruction_modes, core_curriculum,
    count(*) over () as total_count
  from filtered
  order by
    course_subject(course_code) nulls last,
    nullif((regexp_match(coalesce(course_code, ''), '(\d{3})'))[1], '')::int nulls last,
    course_header
  limit least(greatest(p_limit, 0), 100) offset greatest(p_offset, 0);
$$;

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
    limit least(greatest(p_limit, 0), 400);
$$;

-- Structured browse: a searchable/filterable course catalog and a professor directory
set search_path = public, extensions;

-- "C S 314" -> "C S", "M 408C" -> "M", null/unparseable -> null. (Subject = code minus the number)
create or replace function public.course_subject(p_code text)
returns text language sql immutable as $$
  select nullif(btrim(regexp_replace(coalesce(p_code, ''), '\s*\d{3}[A-Za-z]*\s*$', '')), '');
$$;

-- Course level from the 2nd–3rd digits (01–19 lower, 20–79 upper, 80–99 graduate); mirrors courseMeta in lib/courses.ts
create or replace function public.course_level(p_code text)
returns text language sql immutable as $$
  select case
    when num is null then null
    when substr(num, 2, 2)::int <= 19 then 'lower'
    when substr(num, 2, 2)::int <= 79 then 'upper'
    else 'graduate'
  end
  from (select (regexp_match(coalesce(p_code, ''), '(\d{3})[A-Za-z]*\s*$'))[1] as num) t;
$$;

-- Distinct subjects (+ course counts) for the browse filter dropdown.
create or replace function public.course_subjects()
returns table (subject text, n bigint)
language sql stable set search_path = 'public' as $$
  select course_subject(c.course_code) as subject, count(*) as n
  from public.courses c
  where course_subject(c.course_code) is not null
  group by 1
  order by 1;
$$;

-- Paginated course catalog (one row per course header / title). Filters are all optional; total_count
create or replace function public.browse_courses(
  p_search text default null,   -- matches the course header (code + title), case-insensitive
  p_subject text default null,  -- exact subject, e.g. 'C S'
  p_level text default null,    -- 'lower' | 'upper' | 'graduate'
  p_core text default null,     -- a core-curriculum category, e.g. 'Mathematics'
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
    where (p_search is null or course_header ilike '%' || p_search || '%')
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
  limit greatest(p_limit, 0) offset greatest(p_offset, 0);
$$;

-- Full per-section detail for one course (RetrievedSection shape, grouped client-side). Same joins as
-- match_sections_detailed but keyed on course_id instead of an embedding match — drops summary/status.
create or replace function public.course_detail(p_course_id bigint)
returns table (
  section_id        bigint,
  course_header     text,
  description       text,
  instruction_mode  text,
  register_url      text,
  schedule_days     text[],
  schedule_hours    text[],
  schedule_location text[],
  core_curriculum   text[],
  instructors       text[],
  grade_data        jsonb,
  instructor_grades jsonb,
  semester_grades   jsonb,
  evaluations       jsonb,
  professor_ratings jsonb
)
language plpgsql stable set search_path = 'public', 'extensions' as $$
begin
  return query
  select
    s.id,
    c.course_header,
    c.description,
    s.instruction_mode,
    s.register_url,
    s.schedule_days,
    s.schedule_hours,
    s.schedule_location,
    s.core_curriculum,
    coalesce(array_agg(distinct i.name) filter (where i.name is not null), array[]::text[]),
    s.grade_data,
    s.instructor_grades,
    coalesce(
      (select jsonb_agg(jsonb_build_object('semester', cg.semester, 'grades', cg.grades))
       from public.course_grades cg where cg.course_code = c.course_code),
      '[]'::jsonb
    ),
    coalesce(
      jsonb_agg(distinct jsonb_build_object(
        'instructor', ei.name,
        'courseHeader', e.course_header,
        'courseRating', e.course_rating,
        'instructorRating', e.instructor_rating,
        'responseRate', e.response_rate,
        'cesLink', e.ces_link
      )) filter (where e.id is not null),
      '[]'::jsonb
    ),
    coalesce(
      jsonb_agg(distinct jsonb_build_object(
        'instructor', i.name,
        'rmpLegacyId', i.rmp_legacy_id,
        'rmpRating', i.rmp_rating,
        'rmpDifficulty', i.rmp_difficulty,
        'rmpWouldTakeAgain', i.rmp_would_take_again,
        'rmpNumRatings', i.rmp_num_ratings,
        'rmpDepartment', i.rmp_department
      )) filter (where i.rmp_legacy_id is not null),
      '[]'::jsonb
    )
  from public.sections s
  join public.courses c on c.id = s.course_id
  left join public.section_instructors si on si.section_id = s.id
  left join public.instructors i on i.id = si.instructor_id
  left join public.evaluation_sections es on es.section_id = s.id
  left join public.evaluations e on e.id = es.evaluation_id
  left join public.instructors ei on ei.id = e.instructor_id
  where s.course_id = p_course_id
  group by s.id, c.id
  order by s.id;
end;
$$;

-- A professor's identity + the Fall 2026 courses they teach, each with this professor's own grade
-- distribution and CES rating. Powers the professor detail view (RMP, when present, is layered on top
-- live via /api/rmp)
create or replace function public.professor_profile(p_instructor_id bigint)
returns table (
  instructor_id        bigint,
  name                 text,
  rmp_legacy_id        bigint,
  rmp_rating           real,
  rmp_difficulty       real,
  rmp_would_take_again real,
  rmp_num_ratings      int,
  rmp_department       text,
  courses              jsonb
)
language sql stable set search_path = 'public' as $$
  with prof as (
    select id, name, rmp_legacy_id, rmp_rating, rmp_difficulty,
           rmp_would_take_again, rmp_num_ratings, rmp_department
    from public.instructors where id = p_instructor_id
  ),
  taught as (
    select c.id as course_id, c.course_header, c.course_code, s.id as section_id, s.instructor_grades
    from public.sections s
    join public.section_instructors si on si.section_id = s.id and si.instructor_id = p_instructor_id
    join public.courses c on c.id = s.course_id
  ),
  by_course as (
    select
      t.course_id, t.course_header, t.course_code,
      count(distinct t.section_id)::int as num_sections,
      (select ig - 'instructor'
       from taught t2, lateral jsonb_array_elements(coalesce(t2.instructor_grades, '[]'::jsonb)) ig
       where t2.course_id = t.course_id
         and ig->>'instructor' = (select name from prof)
       limit 1) as grades
    from taught t
    group by t.course_id, t.course_header, t.course_code
  ),
  ces as (
    select distinct on (c.id)
      c.id as course_id, e.course_rating, e.instructor_rating
    from public.evaluations e
    join public.evaluation_sections esx on esx.evaluation_id = e.id
    join public.sections s on s.id = esx.section_id
    join public.courses c on c.id = s.course_id
    where e.instructor_id = p_instructor_id
    order by c.id, e.responses_received desc nulls last
  )
  select
    prof.id, prof.name, prof.rmp_legacy_id, prof.rmp_rating, prof.rmp_difficulty,
    prof.rmp_would_take_again, prof.rmp_num_ratings, prof.rmp_department,
    coalesce(
      (select jsonb_agg(jsonb_build_object(
         'courseId', bc.course_id,
         'courseHeader', bc.course_header,
         'courseCode', bc.course_code,
         'numSections', bc.num_sections,
         'grades', bc.grades,
         'courseRating', cs.course_rating,
         'instructorRating', cs.instructor_rating
       ) order by bc.course_code)
       from by_course bc left join ces cs on cs.course_id = bc.course_id),
      '[]'::jsonb
    )
  from prof;
$$;

-- Make course search space/punctuation-insensitive on the code: the header stores "C S 314", but
-- students type "cs 314" or "cs314". Normalize both sides to "cs314" and also match the code that way,
-- while keeping the raw header substring match for titles ("calculus") and already-spaced codes
set search_path = public, extensions;

-- Lowercase + strip everything but letters/digits: "C S 314" / "cs 314" / "cs314" all -> "cs314"
create or replace function public.normalize_code(p text)
returns text language sql immutable as $$
  select regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]', '', 'g');
$$;

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
  limit greatest(p_limit, 0) offset greatest(p_offset, 0);
$$;

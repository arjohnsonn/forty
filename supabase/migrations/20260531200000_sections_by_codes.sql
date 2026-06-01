-- Detailed sections for a set of course codes, so the chat's schedule builder can pull every
-- section of the courses a student names. Codes are matched normalized (uppercased, punctuation/
-- spaces stripped) so "cs 314", "CS314", and the stored "C S 314" all match. Same row shape as
-- course_detail, plus course_id/course_code so several courses can be grouped from one call.
set search_path = public, extensions;

create or replace function public.sections_by_codes(p_codes text[])
returns table (
  course_id         bigint,
  course_code       text,
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
declare
  norm text[];
begin
  -- Normalize the requested codes once ("cs 314" -> "CS314"); bail early if nothing usable was passed.
  select array_agg(distinct regexp_replace(upper(code), '[^A-Z0-9]', '', 'g'))
    into norm
  from unnest(coalesce(p_codes, array[]::text[])) as code
  where btrim(code) <> '';
  if norm is null then
    return;
  end if;

  return query
  select
    c.id,
    c.course_code,
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
  where regexp_replace(upper(c.course_code), '[^A-Z0-9]', '', 'g') = any(norm)
  group by s.id, c.id
  order by c.course_code, s.id;
end;
$$;

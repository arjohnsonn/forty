set search_path = public, extensions;

ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS course_code TEXT;
CREATE INDEX IF NOT EXISTS courses_course_code_idx ON public.courses(course_code);

CREATE TABLE IF NOT EXISTS public.course_grades (
  course_code TEXT  NOT NULL,
  semester    TEXT  NOT NULL,           -- e.g. "Fall 2024"
  grades      JSONB NOT NULL,           -- { A, B, C, D, F, Other }
  PRIMARY KEY (course_code, semester)
);
CREATE INDEX IF NOT EXISTS course_grades_course_code_idx ON public.course_grades(course_code);

DROP FUNCTION IF EXISTS public.match_sections_detailed(vector, float);
CREATE OR REPLACE FUNCTION public.match_sections_detailed(
    embedding vector(768),
    match_threshold float
)
returns table (
    section_id        bigint,
    course_header     text,
    summary           text,
    instruction_mode  text,
    status            text,
    register_url      text,
    schedule_days     text[],
    schedule_hours    text[],
    schedule_location text[],
    core_curriculum   text[],
    instructors       text[],
    grade_data        jsonb,
    instructor_grades jsonb,
    semester_grades   jsonb,
    evaluations       jsonb
)
language plpgsql
set search_path = 'public', 'extensions'
as $$
#variable_conflict use_variable
begin
    return query
    select
        s.id,
        c.course_header,
        s.summary,
        s.instruction_mode,
        s.status,
        s.register_url,
        s.schedule_days,
        s.schedule_hours,
        s.schedule_location,
        s.core_curriculum,
        coalesce(
            array_agg(distinct i.name) filter (where i.name is not null),
            array[]::text[]
        ),
        s.grade_data,
        s.instructor_grades,
        coalesce(
            (
                select jsonb_agg(jsonb_build_object('semester', cg.semester, 'grades', cg.grades))
                from public.course_grades cg
                where cg.course_code = c.course_code
            ),
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
        )
    from public.sections s
    join public.courses c on c.id = s.course_id
    left join public.section_instructors si on si.section_id = s.id
    left join public.instructors i on i.id = si.instructor_id
    left join public.evaluation_sections es on es.section_id = s.id
    left join public.evaluations e on e.id = es.evaluation_id
    left join public.instructors ei on ei.id = e.instructor_id
    where s.embedding is not null
      and (s.embedding <#> embedding) < -match_threshold
    group by s.id, c.id
    order by min(s.embedding <#> embedding);
end;
$$;

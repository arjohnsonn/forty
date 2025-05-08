-- =================================================================================================
-- Course Section and Instructors
-- =================================================================================================
-- terms (e.g. Fall 2024, Spring 2025, …)
CREATE TABLE public.terms (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT     NOT NULL UNIQUE
);

-- courses (e.g. "YOR 601C – BEGINNING YORUBA")
CREATE TABLE public.courses (
  id          BIGSERIAL PRIMARY KEY,
  course_header TEXT     NOT NULL,       -- e.g. "YOR 601C – BEGINNING YORUBA"
  UNIQUE(course_header)
);

-- sections (one row per course+term+section‑number)
CREATE TABLE public.sections (
  id              BIGINT PRIMARY KEY,    -- the unique_id e.g. '30675'
  course_id       BIGINT   NOT NULL REFERENCES public.courses(id),
  term_id         BIGINT   NOT NULL REFERENCES public.terms(id),
  register_url    TEXT,
  instruction_mode TEXT,
  status          TEXT,
  schedule_days   TEXT[],
  schedule_hours  TEXT[],
  schedule_location TEXT[],
  core_curriculum TEXT[],
  CONSTRAINT uq_section_per_term UNIQUE(id, term_id)
);

-- instructors
CREATE TABLE public.instructors (
  id    BIGSERIAL PRIMARY KEY,
  name  TEXT      NOT NULL UNIQUE        -- e.g. 'Abimbola Adelakun'
);

-- link table for the many‑to‑many between sections and instructors
CREATE TABLE public.section_instructors (
  section_id    BIGINT NOT NULL REFERENCES public.sections(id),
  instructor_id BIGINT NOT NULL REFERENCES public.instructors(id),
  PRIMARY KEY(section_id, instructor_id)
);

-- =================================================================================================
-- CES Evaluations
-- =================================================================================================
-- one evaluation record per rawHeader + instructor
CREATE TABLE public.evaluations (
  id                 BIGSERIAL PRIMARY KEY,
  course_header      TEXT     NOT NULL,
  ces_link           TEXT,
  course_questions   JSONB,
  instructor_questions JSONB,
  course_rating      DECIMAL,
  instructor_rating  DECIMAL,
  course_audience    INTEGER,
  responses_received INTEGER,
  response_rate      INTEGER
);

-- join table: an evaluation can cover multiple section uniqueIds,
-- and each section may have multiple evals (if instructor changes)
CREATE TABLE public.evaluation_sections (
  evaluation_id BIGINT NOT NULL REFERENCES public.evaluations(id),
  section_id    BIGINT NOT NULL REFERENCES public.sections(id),
  PRIMARY KEY(evaluation_id, section_id)
);

-- link each evaluation back to the specific instructor
ALTER TABLE public.evaluations
  ADD COLUMN instructor_id BIGINT REFERENCES public.instructors(id);

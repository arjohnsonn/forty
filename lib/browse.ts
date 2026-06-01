import type { SupabaseClient } from "@supabase/supabase-js";
import type { CourseSection, RetrievedSection } from "@/lib/courses";

// ---------------------------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------------------------

export type BrowseCourse = {
  courseId: number;
  courseHeader: string;
  courseCode: string | null;
  numSections: number;
  instructors: string[];
  instructionModes: string[];
  coreCurriculum: string[];
};

export type CourseFilters = {
  search?: string;
  subject?: string;
  level?: string; // 'lower' | 'upper' | 'graduate'
  core?: string; // a core-curriculum category
};

export const COURSE_PAGE_SIZE = 40;

export async function fetchCourseSubjects(
  supabase: SupabaseClient
): Promise<{ subject: string; n: number }[]> {
  const { data, error } = await supabase.rpc("course_subjects");
  if (error) throw error;
  return (data ?? []) as { subject: string; n: number }[];
}

export async function fetchBrowseCourses(
  supabase: SupabaseClient,
  filters: CourseFilters,
  offset: number,
  limit: number = COURSE_PAGE_SIZE
): Promise<{ items: BrowseCourse[]; total: number }> {
  const { data, error } = await supabase.rpc("browse_courses", {
    p_search: filters.search?.trim() || null,
    p_subject: filters.subject || null,
    p_level: filters.level || null,
    p_core: filters.core || null,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  const rows = (data ?? []) as Array<{
    course_id: number;
    course_header: string;
    course_code: string | null;
    num_sections: number;
    instructors: string[] | null;
    instruction_modes: string[] | null;
    core_curriculum: string[] | null;
    total_count: number;
  }>;
  return {
    total: rows[0]?.total_count ?? 0,
    items: rows.map((r) => ({
      courseId: r.course_id,
      courseHeader: r.course_header,
      courseCode: r.course_code,
      numSections: r.num_sections,
      instructors: r.instructors ?? [],
      instructionModes: r.instruction_modes ?? [],
      coreCurriculum: r.core_curriculum ?? [],
    })),
  };
}

// One detailed row per section, as returned by the course_detail RPC.
type CourseDetailRow = {
  section_id: number;
  course_header: string;
  description: string | null;
  instruction_mode: string | null;
  register_url: string | null;
  schedule_days: string[] | null;
  schedule_hours: string[] | null;
  schedule_location: string[] | null;
  core_curriculum: string[] | null;
  instructors: string[] | null;
  grade_data: Record<string, number> | null;
  instructor_grades: RetrievedSection["instructor_grades"];
  semester_grades: RetrievedSection["semester_grades"];
  evaluations: RetrievedSection["evaluations"];
  professor_ratings: RetrievedSection["professor_ratings"];
};

const sectionOf = (r: CourseDetailRow): CourseSection => ({
  section_id: r.section_id,
  instructors: r.instructors ?? [],
  instruction_mode: r.instruction_mode,
  register_url: r.register_url,
  schedule_days: r.schedule_days,
  schedule_hours: r.schedule_hours,
  schedule_location: r.schedule_location,
});

// Collapse a course's per-section rows into the single RetrievedSection the course card expects:
// every section under course_sections, with per-professor grades/evals/RMP merged across them
// (deduped by professor) — the same shape the chat Worker produces.
function groupCourseSections(rows: CourseDetailRow[]): RetrievedSection {
  const rep = rows[0]!;
  const igByInstructor = new Map<string, NonNullable<RetrievedSection["instructor_grades"]>[number]>();
  const evByKey = new Map<string, NonNullable<RetrievedSection["evaluations"]>[number]>();
  const rmpByInstructor = new Map<string, NonNullable<RetrievedSection["professor_ratings"]>[number]>();

  for (const r of rows) {
    for (const ig of r.instructor_grades ?? [])
      if (!igByInstructor.has(ig.instructor)) igByInstructor.set(ig.instructor, ig);
    for (const e of r.evaluations ?? []) {
      const k = e.instructor ?? e.cesLink;
      if (k && !evByKey.has(k)) evByKey.set(k, e);
    }
    for (const p of r.professor_ratings ?? [])
      if (p?.instructor && !rmpByInstructor.has(p.instructor)) rmpByInstructor.set(p.instructor, p);
  }

  return {
    section_id: rep.section_id,
    course_header: rep.course_header,
    description: rep.description,
    instructors: rep.instructors ?? [],
    instruction_mode: rep.instruction_mode,
    register_url: rep.register_url,
    schedule_days: rep.schedule_days,
    schedule_hours: rep.schedule_hours,
    schedule_location: rep.schedule_location,
    core_curriculum: rep.core_curriculum,
    grade_data: rep.grade_data,
    instructor_grades: igByInstructor.size ? Array.from(igByInstructor.values()) : rep.instructor_grades,
    semester_grades: rep.semester_grades,
    evaluations: evByKey.size ? Array.from(evByKey.values()) : rep.evaluations,
    professor_ratings: rmpByInstructor.size
      ? Array.from(rmpByInstructor.values())
      : rep.professor_ratings,
    course_sections: rows.map(sectionOf),
  };
}

export async function fetchCourseDetail(
  supabase: SupabaseClient,
  courseId: number
): Promise<RetrievedSection | null> {
  const { data, error } = await supabase.rpc("course_detail", { p_course_id: courseId });
  if (error) throw error;
  const rows = (data ?? []) as CourseDetailRow[];
  if (!rows.length) return null;
  return groupCourseSections(rows);
}

// Full detail for a course by code ("C S 314") via sections_by_codes — for chat schedule-card clicks.
export async function fetchCourseByCode(
  supabase: SupabaseClient,
  code: string
): Promise<RetrievedSection | null> {
  const { data, error } = await supabase.rpc("sections_by_codes", { p_codes: [code] });
  if (error) throw error;
  const rows = (data ?? []) as CourseDetailRow[];
  if (!rows.length) return null;
  return groupCourseSections(rows);
}

// Full detail for the SPECIFIC course a section belongs to — section_id pins the topic for shared numbers (UGS 303 / C S 378).
export async function fetchCourseBySection(
  supabase: SupabaseClient,
  sectionId: number
): Promise<RetrievedSection | null> {
  const { data } = await supabase.from("sections").select("course_id").eq("id", sectionId).maybeSingle();
  const courseId = (data as { course_id: number } | null)?.course_id;
  if (courseId == null) return null;
  return fetchCourseDetail(supabase, courseId);
}

// ---------------------------------------------------------------------------------------------
// Professors
// ---------------------------------------------------------------------------------------------

export type ProfessorListItem = {
  id: number;
  name: string;
  rmpLegacyId: number | null;
  rmpRating: number | null;
  rmpNumRatings: number | null;
  rmpDepartment: string | null;
};

export type ProfessorCourse = {
  courseId: number;
  courseHeader: string;
  courseCode: string | null;
  numSections: number;
  grades: Record<string, number> | null;
  courseRating: number | null;
  instructorRating: number | null;
};

export type ProfessorProfile = {
  instructorId: number;
  name: string;
  rmpLegacyId: number | null;
  rmpRating: number | null;
  rmpDifficulty: number | null;
  rmpWouldTakeAgain: number | null;
  rmpNumRatings: number | null;
  rmpDepartment: string | null;
  courses: ProfessorCourse[];
};

export const PROFESSOR_PAGE_SIZE = 40;

export async function searchProfessors(
  supabase: SupabaseClient,
  query: string,
  offset: number,
  limit: number = PROFESSOR_PAGE_SIZE
): Promise<{ items: ProfessorListItem[]; total: number }> {
  let q = supabase
    .from("instructors")
    .select("id, name, rmp_legacy_id, rmp_rating, rmp_num_ratings, rmp_department", {
      count: "exact",
    });

  // Each whitespace token must appear in the name (so "john smith" matches "SMITH, JOHN"). Strip
  // PostgREST ilike wildcards so a query can't broaden the match.
  const tokens = query
    .split(/\s+/)
    .map((t) => t.replace(/[%_]/g, "").trim())
    .filter(Boolean);
  for (const t of tokens) q = q.ilike("name", `%${t}%`);

  const { data, error, count } = await q
    .order("rmp_num_ratings", { ascending: false, nullsFirst: false })
    .order("name", { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) throw error;

  const rows = (data ?? []) as Array<{
    id: number;
    name: string;
    rmp_legacy_id: number | null;
    rmp_rating: number | null;
    rmp_num_ratings: number | null;
    rmp_department: string | null;
  }>;
  return {
    total: count ?? 0,
    items: rows.map((r) => ({
      id: r.id,
      name: r.name,
      rmpLegacyId: r.rmp_legacy_id,
      rmpRating: r.rmp_rating,
      rmpNumRatings: r.rmp_num_ratings,
      rmpDepartment: r.rmp_department,
    })),
  };
}

export async function fetchProfessorProfile(
  supabase: SupabaseClient,
  instructorId: number
): Promise<ProfessorProfile | null> {
  const { data, error } = await supabase.rpc("professor_profile", { p_instructor_id: instructorId });
  if (error) throw error;
  const row = ((data ?? []) as Array<{
    instructor_id: number;
    name: string;
    rmp_legacy_id: number | null;
    rmp_rating: number | null;
    rmp_difficulty: number | null;
    rmp_would_take_again: number | null;
    rmp_num_ratings: number | null;
    rmp_department: string | null;
    courses: ProfessorCourse[] | null;
  }>)[0];
  if (!row) return null;
  return {
    instructorId: row.instructor_id,
    name: row.name,
    rmpLegacyId: row.rmp_legacy_id,
    rmpRating: row.rmp_rating,
    rmpDifficulty: row.rmp_difficulty,
    rmpWouldTakeAgain: row.rmp_would_take_again,
    rmpNumRatings: row.rmp_num_ratings,
    rmpDepartment: row.rmp_department,
    courses: row.courses ?? [],
  };
}

import { createClient } from "@supabase/supabase-js";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import {
  appendResponseMessages,
  createDataStreamResponse,
  createIdGenerator,
  jsonSchema,
  streamText,
  tool,
  type CoreMessage,
  type JSONValue,
} from "ai";
// Pure (no React/Supabase) schedule logic + parsing, shared with the Next app. The Worker bundles
// these via esbuild — see lib/scheduler.ts ("…and, later, inside the chat Worker").
import { generateSchedules, type SchedulerPrefs } from "../../../lib/scheduler";
import {
  courseCode,
  formatName,
  formatHours,
  minuteLabel,
  type RetrievedSection,
} from "../../../lib/courses";

// Cloudflare's native rate-limiting binding (configured in wrangler.jsonc).
interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  GOOGLE_GENERATIVE_AI_API_KEY: string;
  GUEST_RATE_LIMITER: RateLimit;
  ALLOWED_ORIGINS?: string;
  MATCH_THRESHOLD?: string;
  RMP_CACHE_TTL?: string;
}

// Same model + dimension as scripts/embed.ts, or query and doc vectors won't match.
const EMBED_MODEL = "models/gemini-embedding-001";
const EMBED_DIM = 768;

const normalize = (v: number[]) => {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
};

/** Embed the user query with Gemini (RETRIEVAL_QUERY), L2-normalized to match the stored vectors. */
async function embedQuery(text: string, apiKey: string): Promise<number[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${EMBED_MODEL}:embedContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: EMBED_MODEL,
        content: { parts: [{ text }] },
        taskType: "RETRIEVAL_QUERY",
        outputDimensionality: EMBED_DIM,
      }),
    },
  );
  if (!res.ok)
    throw new Error(
      `Embedding request failed: ${res.status} ${await res.text()}`,
    );
  const data = (await res.json()) as { embedding: { values: number[] } };
  return normalize(data.embedding.values);
}

// RateMyProfessors live refresh. The snapshot (scripts/rmp.ts) pins each professor to an
// rmp_legacy_id; here we fetch that professor's *current* numbers by id (cheap, exact — no
// re-matching), short-cached at the edge, so a freshly-posted rating shows up without a re-scrape.
const RMP_GQL = "https://www.ratemyprofessors.com/graphql";
const RMP_AUTH = "Basic dGVzdDp0ZXN0"; // public hardcoded RMP web credential (test:test)
const RMP_NODE_QUERY = `query($id: ID!){ node(id: $id){ ... on Teacher { avgRating avgDifficulty numRatings wouldTakeAgainPercent teacherRatingTags { tagName tagCount } } } }`;

type RmpLive = {
  rmpRating: number;
  rmpDifficulty: number;
  rmpNumRatings: number;
  rmpWouldTakeAgain: number | null;
  // The labels students apply most often (e.g. "Tough grader"), highest-count first — same source
  // as the professor card's "Top tags". Empty when the professor has none.
  rmpTags: string[];
};

// A professor's RMP rating computed from reviews of one specific course (vs. their blended overall).
type RmpCourse = {
  code: string;
  rating: number;
  difficulty: number;
  wouldTakeAgain: number | null;
  numRatings: number;
};

// Below this many course-specific reviews the per-course average is too noisy — fall back to overall.
const MIN_COURSE_RATINGS = 3;

// "CH 302 PRINCIPLES OF CHEMISTRY" -> "CH302" (RMP's free-text class form, used as courseFilter).
const rmpCourseCode = (header: string): string =>
  (header.match(/^(.+?\s\d{1,3}[A-Z]*)(?:\s|$)/)?.[1] ?? "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();

// Current RMP numbers for one professor by legacyId. Edge-cached; null on miss/error/timeout (snapshot values are the fallback).
async function fetchRmpLive(
  legacyId: number,
  ttl: number,
  ctx: ExecutionContext,
): Promise<RmpLive | null> {
  const cache = caches.default;
  const cacheKey = new Request(
    `https://rmp-cache.internal/teacher/${legacyId}`,
  );
  const hit = await cache.match(cacheKey);
  if (hit) {
    try {
      return (await hit.json()) as RmpLive;
    } catch {
      // fall through to refetch
    }
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 600);
  try {
    const res = await fetch(RMP_GQL, {
      method: "POST",
      headers: { Authorization: RMP_AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({
        query: RMP_NODE_QUERY,
        variables: { id: btoa(`Teacher-${legacyId}`) },
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const node = ((await res.json()) as any)?.data?.node;
    if (!node) return null;
    const live: RmpLive = {
      rmpRating: node.avgRating,
      rmpDifficulty: node.avgDifficulty,
      rmpNumRatings: node.numRatings,
      rmpWouldTakeAgain:
        typeof node.wouldTakeAgainPercent === "number" &&
        node.wouldTakeAgainPercent >= 0
          ? node.wouldTakeAgainPercent
          : null,
      rmpTags: Array.isArray(node.teacherRatingTags)
        ? [...node.teacherRatingTags]
            .filter((t: any) => t?.tagName)
            .sort((a: any, b: any) => (b.tagCount ?? 0) - (a.tagCount ?? 0))
            .slice(0, 6)
            .map((t: any) => String(t.tagName))
        : [],
    };
    ctx.waitUntil(
      cache.put(
        cacheKey,
        new Response(JSON.stringify(live), {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": `max-age=${ttl}`,
          },
        }),
      ),
    );
    return live;
  } catch {
    return null; // RMP down/slow -> keep snapshot numbers
  } finally {
    clearTimeout(timer);
  }
}

// That professor's RMP rating from reviews of one course (RMP's free-text class code). Edge-cached incl. negatives; null below MIN_COURSE_RATINGS or on miss/error/timeout.
// One review node from RMP's `ratings` GraphQL connection.
type RmpRatingNode = {
  clarityRating: number;
  helpfulRating: number;
  difficultyRating: number;
  wouldTakeAgain: number | null;
};

async function fetchRmpCourse(
  legacyId: number,
  code: string,
  ttl: number,
  ctx: ExecutionContext,
): Promise<RmpCourse | null> {
  const safe = code.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  if (!safe) return null;
  const cache = caches.default;
  const cacheKey = new Request(
    `https://rmp-cache.internal/teacher/${legacyId}/course/${safe}`,
  );
  const hit = await cache.match(cacheKey);
  if (hit) {
    try {
      return (await hit.json()) as RmpCourse | null;
    } catch {
      // fall through
    }
  }
  const store = (value: RmpCourse | null) =>
    ctx.waitUntil(
      cache.put(
        cacheKey,
        new Response(JSON.stringify(value), {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": `max-age=${ttl}`,
          },
        }),
      ),
    );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 600);
  try {
    const res = await fetch(RMP_GQL, {
      method: "POST",
      headers: { Authorization: RMP_AUTH, "Content-Type": "application/json" },
      // `safe` is [A-Z0-9] only, so inlining it as the courseFilter literal is injection-safe.
      body: JSON.stringify({
        query: `query($id: ID!){ node(id: $id){ ... on Teacher { ratings(first: 100, courseFilter: "${safe}"){ edges { node { clarityRating helpfulRating difficultyRating wouldTakeAgain } } } } } }`,
        variables: { id: btoa(`Teacher-${legacyId}`) },
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const edges: { node?: RmpRatingNode | null }[] =
      (
        (await res.json()) as {
          data?: {
            node?: { ratings?: { edges?: { node?: RmpRatingNode | null }[] } };
          };
        }
      )?.data?.node?.ratings?.edges ?? [];
    const reviews = edges
      .map((e) => e?.node)
      .filter((n): n is RmpRatingNode => !!n);
    if (reviews.length < MIN_COURSE_RATINGS) {
      store(null);
      return null;
    }
    const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
    const answered = reviews.filter(
      (r) => r.wouldTakeAgain === 0 || r.wouldTakeAgain === 1,
    );
    const result: RmpCourse = {
      code: safe,
      // RMP "quality" per review is the mean of its clarity + helpfulness sub-scores.
      rating:
        Math.round(
          avg(
            reviews.map(
              (r) => (Number(r.clarityRating) + Number(r.helpfulRating)) / 2,
            ),
          ) * 10,
        ) / 10,
      difficulty:
        Math.round(
          avg(reviews.map((r) => Number(r.difficultyRating))) * 10,
        ) / 10,
      wouldTakeAgain: answered.length
        ? Math.round(
            (100 * answered.filter((r) => r.wouldTakeAgain === 1).length) /
              answered.length,
          )
        : null,
      numRatings: reviews.length,
    };
    store(result);
    return result;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Refresh each section's professor_ratings in place: overall numbers (by id) + the section-course rating (rmpCourse). Fetched once, in parallel; failures leave the snapshot numbers untouched.
async function refreshRmpLive(
  sections: Record<string, unknown>[],
  ttl: number,
  ctx: ExecutionContext,
): Promise<void> {
  const ids = new Set<number>();
  const courseTasks: { prof: any; legacyId: number; code: string }[] = [];
  for (const s of sections) {
    const code = rmpCourseCode(s.course_header as string);
    for (const p of (s.professor_ratings as any[]) ?? []) {
      if (typeof p?.rmpLegacyId !== "number") continue;
      ids.add(p.rmpLegacyId);
      if (code) courseTasks.push({ prof: p, legacyId: p.rmpLegacyId, code });
    }
  }
  if (!ids.size) return;

  const overall = new Map<number, RmpLive>();
  const perCourse = new Map<string, RmpCourse | null>();
  const courseKeys = new Map<string, { legacyId: number; code: string }>();
  for (const t of courseTasks)
    courseKeys.set(`${t.legacyId}|${t.code}`, {
      legacyId: t.legacyId,
      code: t.code,
    });

  await Promise.all([
    ...[...ids].map(async (id) => {
      const live = await fetchRmpLive(id, ttl, ctx);
      if (live) overall.set(id, live);
    }),
    ...[...courseKeys].map(async ([key, { legacyId, code }]) => {
      perCourse.set(key, await fetchRmpCourse(legacyId, code, ttl, ctx));
    }),
  ]);

  for (const s of sections)
    for (const p of (s.professor_ratings as any[]) ?? []) {
      const live = overall.get(p.rmpLegacyId);
      if (live) Object.assign(p, live);
    }
  for (const t of courseTasks) {
    const c = perCourse.get(`${t.legacyId}|${t.code}`);
    if (c) t.prof.rmpCourse = c;
  }
}

const RMP_SCHOOL = btoa("School-1255"); // The University of Texas at Austin
const HONORIFICS = new Set(["dr", "prof", "professor", "mr", "ms", "mrs"]);

// One teacher node from RMP's `newSearch.teachers` GraphQL connection.
type RmpTeacherNode = {
  legacyId: number | null;
  firstName: string;
  lastName: string;
  department: string | null;
  numRatings: number | null;
};

type RmpMatch = { legacyId: number; name: string; department: string | null };

// Best-effort RMP profile for a free-text professor name (UT-scoped). Prefers an exact first+last token match, else the most-rated candidate. Null when RMP returns nothing.
async function searchRmpTeacher(name: string): Promise<RmpMatch | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const res = await fetch(RMP_GQL, {
      method: "POST",
      headers: { Authorization: RMP_AUTH, "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `query($q: TeacherSearchQuery!){ newSearch { teachers(query: $q, first: 8){ edges { node { legacyId firstName lastName department numRatings } } } } }`,
        variables: { q: { text: name, schoolID: RMP_SCHOOL } },
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const edges: { node?: RmpTeacherNode | null }[] =
      (
        (await res.json()) as {
          data?: {
            newSearch?: {
              teachers?: { edges?: { node?: RmpTeacherNode | null }[] };
            };
          };
        }
      )?.data?.newSearch?.teachers?.edges ?? [];
    const nodes = edges
      .map((e) => e?.node)
      .filter(
        (n): n is RmpTeacherNode & { legacyId: number } => n?.legacyId != null,
      );
    if (!nodes.length) return null;
    const tokens = name
      .toLowerCase()
      .split(/[\s,]+/)
      .filter(Boolean);
    const fullName = (n: RmpTeacherNode) =>
      `${n.firstName} ${n.lastName}`.toLowerCase();
    // Prefer exact first+last token matches; among those (RMP has duplicate profiles) take the most-rated (the canonical one). Fall back to the most-rated of all candidates.
    const exacts = nodes.filter((n) =>
      tokens.every((t) => fullName(n).includes(t)),
    );
    const pick = (exacts.length ? exacts : [...nodes]).sort(
      (a, b) => (b.numRatings ?? 0) - (a.numRatings ?? 0),
    )[0];
    return {
      legacyId: pick.legacyId,
      name: `${(pick.firstName ?? "").trim()} ${(pick.lastName ?? "").trim()}`.trim(),
      department: pick.department ?? null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Resolve a free-text professor name to an RMP profile: verified instructors first (pinned legacyId), then a live RMP search (covers professors not in our data).
async function resolveProfessor(
  supabase: any,
  name: string,
): Promise<(RmpMatch & { source: "db" | "rmp" }) | null> {
  const tokens = name
    .toLowerCase()
    .split(/[\s,]+/)
    .map((t) => t.replace(/[%_*]/g, "")) // strip ilike/PostgREST wildcards so a name can't broaden the match
    .filter((t) => t.length > 1 && !HONORIFICS.has(t));
  if (tokens.length) {
    let q = supabase
      .from("instructors")
      .select("name, rmp_legacy_id, rmp_department")
      .not("rmp_legacy_id", "is", null);
    for (const t of tokens) q = q.ilike("name", `%${t}%`);
    const { data } = await q
      .order("rmp_num_ratings", { ascending: false, nullsFirst: false })
      .limit(1);
    const row: any = (data as any)?.[0];
    if (row?.rmp_legacy_id != null)
      return {
        legacyId: row.rmp_legacy_id,
        name: row.name,
        department: row.rmp_department ?? null,
        source: "db",
      };
  }
  const rmp = await searchRmpTeacher(name);
  return rmp ? { ...rmp, source: "rmp" } : null;
}

function corsHeaders(req: Request, env: Env): Record<string, string> {
  const allowed = (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const origin = req.headers.get("Origin") ?? "";
  const allowOrigin =
    allowed.length === 0 ? "*" : allowed.includes(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers":
      "Authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

const errorJson = (
  cors: Record<string, string>,
  status: number,
  name: string,
  message: string,
) =>
  new Response(JSON.stringify({ error: { name, message } }), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

const SYSTEM_PROMPT =
  `You are a course-advising assistant for UT Austin's Fall 2026 registration. ` +
  `Answer using only the "Sections" data provided in the conversation. Each entry is one course; it may be ` +
  `offered as several sections (course_sections, each with its own instructors, meeting times, and register ` +
  `link). Do NOT enumerate every section as a bullet list — the course card shown beneath your answer already ` +
  `lists each section grouped by professor. When the user asks about times or which section to take, summarize ` +
  `instead: how many sections there are, which professors teach them (and roughly how many each), the common ` +
  `meeting patterns, and any notable option — only list sections individually when there are just a few (about ` +
  `three or fewer) or the user explicitly asks to see them all. Each entry also includes the course, ` +
  `instructors, meeting schedule, instruction mode, the historical course-wide grade distribution (grade_data), ` +
  `per-professor grade distributions (instructor_grades), the grade distribution broken down by semester ` +
  `(semester_grades, an array of { semester, grades } from Fall 2020 onward — use it to describe trends over ` +
  `time, e.g. whether a course has gotten harder), past course evaluations (evaluations, with ` +
  `courseRating and instructorRating out of 5), and RateMyProfessors ratings (professor_ratings, with ` +
  `rmpRating and rmpDifficulty out of 5, rmpWouldTakeAgain as a percentage, and rmpNumRatings — these are ` +
  `student-submitted ratings from RateMyProfessors, separate from the official CES evaluations; call them ` +
  `"RateMyProfessors" so the two aren't confused, and if a professor has no professor_ratings entry or ` +
  `rmpNumRatings is 0, don't cite an RMP score). A professor_ratings entry may also include rmpTags — the ` +
  `labels students most often apply to that professor on RateMyProfessors (e.g. "Tough grader", "Test heavy", ` +
  `"Caring") — weave a few in when describing what a professor is like, but never present them as official ` +
  `evaluations. An entry may also include rmpCourse — ` +
  `that same professor's RateMyProfessors rating computed only from reviews of THIS course (rmpCourse.code), ` +
  `with rmpCourse.rating and rmpCourse.difficulty out of 5, rmpCourse.wouldTakeAgain percent, and ` +
  `rmpCourse.numRatings reviews. When the question is about that specific course, prefer rmpCourse over the ` +
  `blended overall RMP numbers and note it's course-specific (e.g. "in CH302 specifically"). ` +
  `For any professor the user names — including one not in the Sections data, or a course a professor is ` +
  `not teaching this term — call the getProfessorRating tool to fetch their RateMyProfessors numbers (pass ` +
  `the course code for course-specific or comparison questions) instead of saying the data is unavailable. ` +
  `Grade fields are counts of A/B/C/D/F/Other. ` +
  `Instructor names in the structured fields are "LAST, FIRST" (e.g. "LEWIS, CHARLTON N") while the summary ` +
  `prose uses "First Last" (e.g. "Charlton N Lewis") — treat them as the same person when matching a query. ` +
  `instructor_grades covers every instructor of a section, but evaluations may exist for only some of them; ` +
  `if a professor has no evaluation entry, cite only their grade distribution rather than inventing ratings. ` +
  `Course numbers encode the course: the first digit is the semester credit-hour value (e.g. 3 = a 3-credit ` +
  `course, 4 = a 4-credit course), and the second and third digits give the level — 01–19 is lower-division ` +
  `(freshman-level), 20–79 is upper-division (sophomore–senior-level), and 80–99 is graduate-level. ` +
  `Use this to answer questions about credit hours or course level (e.g. "C S 314" is a 3-credit upper-division course). ` +
  `Cite concrete grade percentages and ratings when relevant. ` +
  `When the student asks you to build, plan, or generate a schedule — or which sections of several courses ` +
  `fit together without time conflicts — call the buildSchedule tool with the course codes they name and any ` +
  `time/day preferences (noClassBefore, noClassAfter, daysOff, prioritize); never assemble a schedule yourself, ` +
  `because only the tool checks for conflicts. Describe the best one or two schedules it returns — the courses, ` +
  `their professors, and meeting days/times, plus notable traits like days off or a compact week. If it reports ` +
  `notFound codes, say which weren't found; if courses are infeasible or appear in alwaysConflict, explain those ` +
  `sections can't be combined under the given preferences and suggest relaxing one. The course cards shown beneath ` +
  `your answer let the student open a course and add a section. ` +
  `Do not mention course enrollment status ` +
  `(open, closed, waitlisted) — it is not provided and changes over time. If the provided sections do not ` +
  `contain the answer, say so instead of guessing.`;

// --- Schedule builder (buildSchedule tool) -----------------------------------------------------

const DAY_INDEX: Record<string, number> = {
  monday: 0, mon: 0, m: 0,
  tuesday: 1, tues: 1, tue: 1, tu: 1, t: 1,
  wednesday: 2, wed: 2, w: 2,
  thursday: 3, thurs: 3, thur: 3, thu: 3, th: 3,
  friday: 4, fri: 4, f: 4,
  saturday: 5, sat: 5, sa: 5,
  sunday: 6, sun: 6, su: 6,
};
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// "9", "9am", "9:30 am", "13:00", "1pm" -> minute-of-day; null if unparseable.
function parseClock(raw: string): number | null {
  const m = (raw ?? "").trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const ap = (m[3] ?? "").replace(/\./g, "").toLowerCase();
  if (ap === "pm") h = h === 12 ? 12 : h + 12;
  else if (ap === "am") h = h === 12 ? 0 : h;
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// One section row from the sections_by_codes RPC (course_detail shape + course_id/course_code).
type DetailRow = {
  course_id: number;
  course_code: string | null;
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

// Collapse per-section rows into one RetrievedSection per course (every section under
// course_sections; per-professor grades/evals/RMP merged across them) — the shape the scheduler
// and the course chips expect, mirroring the RAG grouping above and lib/browse.ts.
function groupCourses(rows: DetailRow[]): RetrievedSection[] {
  // Group by course CODE, not course_id: UT lists several `courses` rows under one code (topics /
  // cross-lists), and "schedule GOV 310L" means one GOV 310L slot whose sections we choose among —
  // grouping by id would schedule each row as a separate course (two GOV 310L sections at once).
  const byCode = new Map<string, DetailRow[]>();
  for (const r of rows) {
    const code = courseCode(r.course_header);
    const list = byCode.get(code);
    if (list) list.push(r);
    else byCode.set(code, [r]);
  }
  const out: RetrievedSection[] = [];
  for (const group of byCode.values()) {
    const rep = group[0]!;
    const ig = new Map<string, any>();
    const ev = new Map<string, any>();
    const rmp = new Map<string, any>();
    for (const g of group) {
      for (const x of (g.instructor_grades as any[]) ?? [])
        if (x?.instructor && !ig.has(x.instructor)) ig.set(x.instructor, x);
      for (const e of (g.evaluations as any[]) ?? []) {
        const k = e?.instructor ?? e?.cesLink;
        if (k && !ev.has(k)) ev.set(k, e);
      }
      for (const p of (g.professor_ratings as any[]) ?? [])
        if (p?.instructor && !rmp.has(p.instructor)) rmp.set(p.instructor, p);
    }
    out.push({
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
      instructor_grades: ig.size ? ([...ig.values()] as any) : rep.instructor_grades,
      semester_grades: rep.semester_grades,
      evaluations: ev.size ? ([...ev.values()] as any) : rep.evaluations,
      professor_ratings: rmp.size ? ([...rmp.values()] as any) : rep.professor_ratings,
      course_sections: group.map((g) => ({
        section_id: g.section_id,
        instructors: g.instructors ?? [],
        instruction_mode: g.instruction_mode,
        register_url: g.register_url,
        schedule_days: g.schedule_days,
        schedule_hours: g.schedule_hours,
        schedule_location: g.schedule_location,
      })),
    });
  }
  return out;
}

export default {
  async fetch(
    req: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const cors = corsHeaders(req, env);
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    if (req.method !== "POST")
      return new Response("Method Not Allowed", { status: 405, headers: cors });

    if (
      !env.SUPABASE_URL ||
      !env.SUPABASE_ANON_KEY ||
      !env.GOOGLE_GENERATIVE_AI_API_KEY
    ) {
      return errorJson(
        cors,
        500,
        "Config Error",
        "Worker is missing required secrets — run `wrangler secret put`.",
      );
    }

    try {
      const authorization = req.headers.get("Authorization");
      if (!authorization)
        return errorJson(
          cors,
          401,
          "Request Error",
          "Missing authorization header",
        );
      const jwtToken = authorization.split(" ")[1] ?? "";

      const ip =
        req.headers.get("cf-connecting-ip") ??
        req.headers.get("x-forwarded-for") ??
        "unknown";

      const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false },
      });

      const {
        data: { user },
      } = await supabase.auth.getUser(jwtToken);

      // Rate limit guests only (logged-in users are unlimited) via Cloudflare's native limiter.
      if (!user && env.GUEST_RATE_LIMITER) {
        const { success } = await env.GUEST_RATE_LIMITER.limit({ key: ip });
        if (!success) {
          return errorJson(
            cors,
            429,
            "Rate Limit Error",
            "Too many requests — please slow down or sign in.",
          );
        }
      }

      let body: { chatId?: string; messages?: any[] };
      try {
        body = (await req.json()) as typeof body;
      } catch {
        return errorJson(cors, 400, "Request Error", "Invalid JSON body.");
      }
      const { chatId, messages } = body;
      if (!Array.isArray(messages) || messages.length === 0) {
        return errorJson(
          cors,
          400,
          "Request Error",
          "Missing 'messages' in body.",
        );
      }
      // useChat POSTs the full messages array; embed the latest user message.
      const lastUser = [...messages].reverse().find((m) => m?.role === "user");
      const message =
        (typeof lastUser?.content === "string" && lastUser.content.trim()) ||
        (Array.isArray(lastUser?.parts)
          ? lastUser.parts
              .filter((p: any) => p?.type === "text")
              .map((p: any) => p.text)
              .join(" ")
              .trim()
          : "");
      if (!message)
        return errorJson(
          cors,
          400,
          "Request Error",
          "No user message to answer.",
        );

      let embedding: number[];
      try {
        embedding = await embedQuery(message, env.GOOGLE_GENERATIVE_AI_API_KEY);
      } catch (e) {
        console.error(e);
        return errorJson(
          cors,
          500,
          "Embedding Error",
          "Failed to embed the query, please try again.",
        );
      }

      const matchThreshold = env.MATCH_THRESHOLD
        ? Number(env.MATCH_THRESHOLD)
        : 0.5;
      // Over-fetch, then keep one section per course — a course with several sections (same summary)
      // would otherwise fill the results with duplicates and crowd out other courses.
      const { data: sections, error: matchError } = await supabase
        .rpc("match_sections_detailed", {
          embedding: JSON.stringify(embedding),
          match_threshold: matchThreshold,
        })
        .limit(25);

      if (matchError) {
        console.error(matchError);
        return errorJson(
          cors,
          500,
          "Internal Server Error",
          "Error finding sections, please try again.",
        );
      }

      // Group by course code ("C S 378") so different sections — and different topics of one number
      // (the many "C S 378" topics) — collapse to one course. The representative keeps a
      // `course_sections` list (every section's times/instructor/register link) and merged
      // per-professor grades + evaluations across the sections. `status` (waitlisted/open/closed) is
      // point-in-time and can't be kept live, so it's dropped before reaching the model or UI.
      const courseCodeOf = (header: string) =>
        header.match(/^(.+?\s\d{1,3}[A-Z]*)(?:\s|$)/)?.[1] ?? header;
      const MAX_COURSES = 6;
      // Cosine-similarity margin below the top match. A specific-course question makes one course
      // match far better than the rest, so the others fall outside the margin and get dropped.
      const MATCH_MARGIN = 0.08;
      const groups = new Map<string, Record<string, unknown>[]>();
      const order: string[] = [];
      for (const s of (sections ?? []) as Record<string, unknown>[]) {
        const code = courseCodeOf(s.course_header as string);
        if (!groups.has(code)) {
          groups.set(code, []);
          order.push(code);
        }
        groups.get(code)!.push(s);
      }
      const ranked = order.slice(0, MAX_COURSES).map((code) => {
        const group = groups.get(code)!;
        const { status: _status, similarity, ...rep } = group[0]!;
        const igByInstructor = new Map<string, unknown>();
        const evByKey = new Map<string, any>();
        const rmpByInstructor = new Map<string, unknown>();
        for (const g of group) {
          for (const ig of (g.instructor_grades as any[]) ?? [])
            if (!igByInstructor.has(ig.instructor))
              igByInstructor.set(ig.instructor, ig);
          for (const e of (g.evaluations as any[]) ?? []) {
            const k = e.instructor ?? e.cesLink;
            if (k && !evByKey.has(k)) evByKey.set(k, e);
          }
          for (const p of (g.professor_ratings as any[]) ?? [])
            if (p?.instructor && !rmpByInstructor.has(p.instructor))
              rmpByInstructor.set(p.instructor, p);
        }
        return {
          similarity: typeof similarity === "number" ? similarity : 0,
          section: {
            ...rep,
            instructor_grades: igByInstructor.size
              ? [...igByInstructor.values()]
              : rep.instructor_grades,
            evaluations: evByKey.size ? [...evByKey.values()] : rep.evaluations,
            professor_ratings: rmpByInstructor.size
              ? [...rmpByInstructor.values()]
              : rep.professor_ratings,
            course_sections: group.map((g) => ({
              section_id: g.section_id,
              instructors: g.instructors,
              instruction_mode: g.instruction_mode,
              register_url: g.register_url,
              schedule_days: g.schedule_days,
              schedule_hours: g.schedule_hours,
              schedule_location: g.schedule_location,
            })),
          },
        };
      });
      // If the question names a specific course (its code appears in the query, e.g. "cs 439" ->
      // "cs439"), show ONLY that course. Otherwise (vague/browse queries) keep the top course plus
      // any others within the similarity margin.
      const norm = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, "");
      const queryNorm = norm(message);
      const explicit = ranked.filter((r) => {
        const header = (r.section as Record<string, unknown>)
          .course_header as string;
        const code = norm(courseCodeOf(header));
        return code.length >= 4 && queryNorm.includes(code);
      });
      let chosen = explicit;
      if (chosen.length === 0) {
        const topSimilarity = ranked[0]?.similarity ?? 0;
        chosen = ranked.filter(
          (r, i) => i === 0 || topSimilarity - r.similarity <= MATCH_MARGIN,
        );
      }
      // Only surface courses when the question is actually about courses. Meta/conversational
      // questions ("what did I just ask") top out around 0.60 similarity; real course queries are
      // ~0.64+, so below this we show no chips and give the model no sections.
      const COURSE_MIN_SIMILARITY = 0.62;
      const aboutCourses =
        (ranked[0]?.similarity ?? 0) >= COURSE_MIN_SIMILARITY;
      const cleanSections = aboutCourses ? chosen.map((r) => r.section) : [];

      // Swap the snapshot RMP numbers for live ones (edge-cached) before they reach the model + UI.
      if (cleanSections.length > 0) {
        const rmpTtl = env.RMP_CACHE_TTL ? Number(env.RMP_CACHE_TTL) : 3600;
        await refreshRmpLive(
          cleanSections as Record<string, unknown>[],
          rmpTtl,
          ctx,
        );
      }

      const injectedSections =
        cleanSections.length > 0
          ? JSON.stringify(cleanSections)
          : "No documents found";

      const completionMessages: CoreMessage[] = [
        { role: "user", content: `Sections:\n${injectedSections}` },
        ...messages,
      ];

      const google = createGoogleGenerativeAI({
        apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY,
      });

      // When buildSchedule runs, the courses it scheduled become the chips (they're exactly what the
      // answer is about), overriding the RAG-retrieved chips. Captured here, read in onFinish.
      let scheduledCourses: RetrievedSection[] = [];

      return createDataStreamResponse({
        headers: cors,
        // Course chips are attached in onFinish, filtered to the courses the answer actually
        // discusses (so retrieved-but-unmentioned courses don't show up as chips).
        execute: (dataStream) => {
          const result = streamText({
            model: google("gemini-2.5-flash"),
            system: SYSTEM_PROMPT,
            messages: completionMessages,
            temperature: 0.3,
            maxTokens: 4096,
            maxSteps: 5,
            tools: {
              getProfessorRating: tool({
                description:
                  "Look up a professor's RateMyProfessors ratings — overall, or for a specific course using ALL of that professor's reviews for it (including courses they are NOT teaching this semester). Use whenever the user names a specific professor and asks about their RMP rating/difficulty, or wants to compare a professor across courses. Pass the course code (e.g. M408C, CH302) when the question is course-specific. Do not say RMP data is unavailable without calling this first.",
                parameters: jsonSchema<{
                  professor: string;
                  course?: string;
                }>({
                  type: "object",
                  properties: {
                    professor: {
                      type: "string",
                      description:
                        "Professor name as the user wrote it, e.g. 'Eric Staron' or 'Staron'.",
                    },
                    course: {
                      type: "string",
                      description:
                        "Optional course code, e.g. 'M408C' or 'CH 302'. Omit for the overall rating.",
                    },
                  },
                  required: ["professor"],
                  additionalProperties: false,
                }),
                execute: async ({ professor, course }) => {
                  const ttl = env.RMP_CACHE_TTL
                    ? Number(env.RMP_CACHE_TTL)
                    : 3600;
                  const who = await resolveProfessor(supabase, professor);
                  if (!who)
                    return {
                      found: false,
                      message: `No RateMyProfessors profile found for "${professor}" at UT Austin.`,
                    };
                  const overall = await fetchRmpLive(who.legacyId, ttl, ctx);
                  const out: Record<string, unknown> = {
                    found: true,
                    professor: who.name,
                    department: who.department,
                    profileUrl: `https://www.ratemyprofessors.com/professor/${who.legacyId}`,
                    overall: overall
                      ? {
                          rating: overall.rmpRating,
                          difficulty: overall.rmpDifficulty,
                          wouldTakeAgainPercent: overall.rmpWouldTakeAgain,
                          numRatings: overall.rmpNumRatings,
                          tags: overall.rmpTags,
                        }
                      : null,
                  };
                  if (course && course.trim()) {
                    const c = await fetchRmpCourse(
                      who.legacyId,
                      course,
                      ttl,
                      ctx,
                    );
                    out.course = c
                      ? {
                          code: c.code,
                          rating: c.rating,
                          difficulty: c.difficulty,
                          wouldTakeAgainPercent: c.wouldTakeAgain,
                          numRatings: c.numRatings,
                        }
                      : {
                          code: course
                            .replace(/[^A-Za-z0-9]/g, "")
                            .toUpperCase(),
                          available: false,
                          note: `Fewer than ${MIN_COURSE_RATINGS} RateMyProfessors reviews for this professor in this course — use the overall rating instead.`,
                        };
                  }
                  return out;
                },
              }),
              buildSchedule: tool({
                description:
                  "Generate ranked, conflict-free class schedules from the specific courses a student names. Call this whenever the student asks you to build, plan, generate, or put together a schedule, or asks which sections of several courses fit together without time conflicts. Pass each course code they mention (as written, e.g. 'C S 314', 'M 408C') plus any time/day preferences. Never hand-build a schedule yourself — only this tool checks for conflicts.",
                parameters: jsonSchema<{
                  courses: string[];
                  noClassBefore?: string;
                  noClassAfter?: string;
                  daysOff?: string[];
                  prioritize?:
                    | "best"
                    | "easiest"
                    | "compact"
                    | "earliest"
                    | "daysoff";
                }>({
                  type: "object",
                  properties: {
                    courses: {
                      type: "array",
                      items: { type: "string" },
                      description:
                        "Course codes to schedule, e.g. ['C S 314', 'M 408C', 'GOV 310L'].",
                    },
                    noClassBefore: {
                      type: "string",
                      description:
                        "Earliest acceptable class start time, e.g. '9:00 AM'. Omit if no preference.",
                    },
                    noClassAfter: {
                      type: "string",
                      description:
                        "Latest acceptable class end time, e.g. '6:00 PM'. Omit if no preference.",
                    },
                    daysOff: {
                      type: "array",
                      items: { type: "string" },
                      description:
                        "Weekdays that must have no classes, e.g. ['Friday'].",
                    },
                    prioritize: {
                      type: "string",
                      enum: [
                        "best",
                        "easiest",
                        "compact",
                        "earliest",
                        "daysoff",
                      ],
                      description:
                        "What to optimize: 'best' (top professors — the default), 'easiest' (highest historical A-rates), 'compact' (fewest gaps between classes), 'earliest' (favor later start times), 'daysoff' (most class-free weekdays).",
                    },
                  },
                  required: ["courses"],
                  additionalProperties: false,
                }),
                execute: async ({
                  courses,
                  noClassBefore,
                  noClassAfter,
                  daysOff,
                  prioritize,
                }) => {
                  const codes = (courses ?? [])
                    .map((c) => String(c).trim())
                    .filter(Boolean)
                    .slice(0, 8); // bound the search; 8 courses is already well past a full load
                  if (!codes.length)
                    return {
                      ok: false,
                      message: "No course codes were provided to schedule.",
                    };

                  const { data: rows, error } = await supabase.rpc(
                    "sections_by_codes",
                    { p_codes: codes },
                  );
                  if (error) {
                    console.error("sections_by_codes error:", error);
                    return {
                      ok: false,
                      message:
                        "Couldn't load course sections right now. Please try again.",
                    };
                  }

                  const grouped = groupCourses((rows ?? []) as DetailRow[]);
                  scheduledCourses = grouped;

                  const norm = (s: string) =>
                    s.toUpperCase().replace(/[^A-Z0-9]/g, "");
                  const found = new Set(
                    grouped.map((g) => norm(courseCode(g.course_header))),
                  );
                  const notFound = codes.filter((c) => !found.has(norm(c)));

                  if (!grouped.length)
                    return {
                      ok: true,
                      requested: codes,
                      notFound,
                      schedules: [],
                      infeasible: [],
                      alwaysConflict: [],
                      message:
                        "None of those course codes matched a Fall 2026 course.",
                    };

                  const prefs: SchedulerPrefs = {
                    rank: prioritize ?? "best",
                  };
                  const before = noClassBefore ? parseClock(noClassBefore) : null;
                  const after = noClassAfter ? parseClock(noClassAfter) : null;
                  if (before != null) prefs.earliestStartMin = before;
                  if (after != null) prefs.latestEndMin = after;
                  const offDays = (daysOff ?? [])
                    .map((d) => DAY_INDEX[String(d).trim().toLowerCase()])
                    .filter((d): d is number => typeof d === "number");
                  if (offDays.length) prefs.requiredDaysOff = offDays;

                  const result = generateSchedules(grouped, prefs);

                  const schedules = result.schedules.slice(0, 3).map((s) => ({
                    courses: s.picks.map((p) => {
                      const sec = p.section;
                      return {
                        code: courseCode(p.course.course_header),
                        sectionId: sec.section_id,
                        instructors: (sec.instructors ?? [])
                          .map(formatName)
                          .filter(Boolean),
                        instructionMode: sec.instruction_mode,
                        meetings: (sec.schedule_days ?? []).map((d, i) => ({
                          days: (d ?? "").trim(),
                          time:
                            formatHours(sec.schedule_hours?.[i] ?? "") || "TBA",
                          location: (sec.schedule_location?.[i] ?? "").trim(),
                        })),
                      };
                    }),
                    quality: Math.round(s.quality * 100) / 100,
                    ease: Math.round(s.ease * 100) / 100,
                    daysOff: s.daysOff
                      .map((d) => DAY_NAMES[d])
                      .filter(Boolean),
                    earliestStart:
                      s.earliestStart != null
                        ? minuteLabel(s.earliestStart)
                        : null,
                    gapHours: Math.round((s.gapMinutes / 60) * 10) / 10,
                  }));

                  return {
                    ok: true,
                    requested: codes,
                    notFound,
                    infeasible: result.infeasible,
                    alwaysConflict: result.alwaysConflict,
                    truncated: result.truncated,
                    count: result.schedules.length,
                    schedules,
                  };
                },
              }),
            },
            experimental_generateMessageId: createIdGenerator({
              prefix: "msgs",
              size: 16,
            }),
            async onFinish({ response }) {
              // Show chips only for courses the answer actually mentions (match the course code in
              // the text). If it names none (e.g. a general/professor answer), keep all retrieved.
              const answerText = response.messages
                .filter((m: any) => m.role === "assistant")
                .map((m: any) =>
                  typeof m.content === "string"
                    ? m.content
                    : Array.isArray(m.content)
                      ? m.content
                          .map((p: { type?: string; text?: string }) =>
                            p?.type === "text" ? (p.text ?? "") : "",
                          )
                          .join(" ")
                      : "",
                )
                .join(" ");
              const answerNorm = norm(answerText);
              const mentioned = (
                cleanSections as Record<string, unknown>[]
              ).filter((s) => {
                const codeNorm = norm(courseCodeOf(s.course_header as string));
                return codeNorm.length >= 4 && answerNorm.includes(codeNorm);
              });
              const shownSections =
                mentioned.length > 0 ? mentioned : cleanSections;
              // A built schedule's courses are exactly what the answer is about, so they take
              // precedence over the RAG-retrieved chips.
              const annotationSections =
                scheduledCourses.length > 0 ? scheduledCourses : shownSections;

              if (annotationSections.length > 0) {
                dataStream.writeMessageAnnotation({
                  type: "courses",
                  sections: annotationSections,
                } as unknown as JSONValue);
              }

              // Only logged-in users persist conversations.
              if (!user || !chatId) return;
              const saved = appendResponseMessages({
                messages: messages as any,
                responseMessages: response.messages,
              });
              // Re-attach the annotation (not in response.messages) so reloads keep the chips.
              const last = saved[saved.length - 1] as any;
              if (last && annotationSections.length > 0) {
                last.annotations = [
                  { type: "courses", sections: annotationSections },
                ];
              }
              const { error } = await supabase
                .from("conversations")
                .update({ messages: JSON.stringify(saved) })
                .eq("id", chatId);
              if (error) console.error("Error saving convo:", error);
            },
            async onError(error) {
              console.error("Error:", error);
            },
          });
          result.mergeIntoDataStream(dataStream, { sendSources: true });
        },
        onError: (error) => {
          console.error("Stream error:", error);
          return "Something went wrong generating the response. Please try again.";
        },
      });
    } catch (err) {
      console.error("Worker error:", err);
      return errorJson(
        cors,
        500,
        "Worker Error",
        err instanceof Error ? err.message : String(err),
      );
    }
  },
};

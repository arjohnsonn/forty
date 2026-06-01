// Conflict-free schedule generation over a set of desired courses. Pure (no React/Supabase) so it runs in the browser (the composer's "Add classes" planner) and, later, inside the chat Worker.

import {
  parseDays,
  parseHourRange,
  courseCode,
  type RetrievedSection,
  type CourseSection,
  type TimeBlock,
} from "./courses";

export type RankMode = "best" | "easiest" | "compact" | "earliest" | "daysoff";

export type SchedulerPrefs = {
  /** Drop sections meeting before this minute-of-day (e.g. 540 = 9:00 AM). */
  earliestStartMin?: number | null;
  /** Drop sections meeting after this minute-of-day (e.g. 1080 = 6:00 PM). */
  latestEndMin?: number | null;
  /** Times to keep free (lunch, work). Sections meeting during these are dropped. */
  avoidBlocks?: TimeBlock[];
  /** Weekdays that must be class-free (0=Mon … 6=Sun). Hard filter: sections meeting then are dropped. */
  requiredDaysOff?: number[];
  /** Keep only schedules whose mean professor quality (0–1) is within these bounds. */
  minQuality?: number | null;
  maxQuality?: number | null;
  /** Keep only schedules whose total weekly gap (minutes) is within these bounds. */
  minGapMin?: number | null;
  maxGapMin?: number | null;
  /** Ranking emphasis. */
  rank?: RankMode;
  /** Sort direction for the ranking: "desc" (best first, default) or "asc" (worst first). */
  rankDir?: "asc" | "desc";
};

type Meeting = { days: number[]; startMin: number; endMin: number };

/** One placeable section + its parsed meetings, a 0–1 quality score, and a 0–1 ease (A-rate) score. */
type Candidate = {
  course: RetrievedSection;
  section: CourseSection;
  meetings: Meeting[];
  quality: number;
  ease: number;
};

export type ScheduledPick = {
  course: RetrievedSection;
  section: CourseSection;
};

export type GeneratedSchedule = {
  picks: ScheduledPick[];
  /** 0–1 overall score used for ranking. */
  score: number;
  /** Mean 0–1 professor quality across the picks (RMP / CES / A-rate blend). */
  quality: number;
  /** Minutes of idle gaps between back-to-back classes (lower = more compact). */
  gapMinutes: number;
  /** Weekday indices (0=Mon … 4=Fri) with no classes. */
  daysOff: number[];
  /** Earliest class start across the week (minute-of-day), or null if all online. */
  earliestStart: number | null;
  /** Latest class end across the week (minute-of-day), or null if all online. */
  latestEnd: number | null;
  /** Mean 0–1 historical A-rate across the picks (neutral 0.5 when unknown). */
  ease: number;
};

export type SchedulerResult = {
  /** Ranked best-first; empty when no conflict-free combination exists. */
  schedules: GeneratedSchedule[];
  /** Course codes with no section left after applying the hard preferences. */
  infeasible: string[];
  /** Course-code pairs whose every section pairing conflicts (a hint when nothing fits). */
  alwaysConflict: [string, string][];
  /** True if the search hit its cap — results are a (good) sample, not exhaustive. */
  truncated: boolean;
};

const GRADE_KEYS = ["A", "B", "C", "D", "F", "Other"] as const;
const MAX_RESULTS = 60; // keep the best N after ranking (UI shows ~10)
const MAX_NODES = 200_000; // search-budget guard so a huge catalog can't hang the tab

const aRate = (g: Record<string, number> | null | undefined): number | null => {
  if (!g) return null;
  const total = GRADE_KEYS.reduce((s, k) => s + (Number(g[k]) || 0), 0);
  return total > 0 ? (Number(g.A) || 0) / total : null;
};

const meetingsOf = (sec: {
  schedule_days: string[] | null;
  schedule_hours: string[] | null;
}): Meeting[] => {
  const days = sec.schedule_days ?? [];
  const hours = sec.schedule_hours ?? [];
  const out: Meeting[] = [];
  for (let i = 0; i < days.length; i++) {
    const d = parseDays(days[i] ?? "");
    const r = parseHourRange(hours[i] ?? "");
    if (d.length && r)
      out.push({ days: d, startMin: r.startMin, endMin: r.endMin });
  }
  return out;
};

const meetingsClash = (a: Meeting, b: Meeting): boolean =>
  a.days.some((d) => b.days.includes(d)) &&
  a.startMin < b.endMin &&
  b.startMin < a.endMin;

const candidatesClash = (a: Candidate, b: Candidate): boolean => {
  for (const m of a.meetings)
    for (const n of b.meetings) if (meetingsClash(m, n)) return true;
  return false;
};

// A section passes when none of its meetings violate the time bounds or hit an avoid-block.
const passesPrefs = (meetings: Meeting[], prefs: SchedulerPrefs): boolean => {
  for (const m of meetings) {
    if (prefs.earliestStartMin != null && m.startMin < prefs.earliestStartMin)
      return false;
    if (prefs.latestEndMin != null && m.endMin > prefs.latestEndMin)
      return false;
    if (
      prefs.requiredDaysOff?.length &&
      m.days.some((d) => prefs.requiredDaysOff!.includes(d))
    )
      return false;
    for (const b of prefs.avoidBlocks ?? [])
      if (
        b.days.some((d) => m.days.includes(d)) &&
        m.startMin < b.endMin &&
        b.startMin < m.endMin
      )
        return false;
  }
  return true;
};

// 0–1 quality for the section's professor(s): blend of RMP rating, CES instructor rating, and A-rate. Neutral 0.5 when nothing is known so a data-less section isn't unfairly buried.
const sectionQuality = (
  course: RetrievedSection,
  section: CourseSection,
): number => {
  const names = section.instructors ?? [];
  const find = <T extends { instructor: string }>(
    arr: T[] | null | undefined,
  ): T | undefined => (arr ?? []).find((x) => names.includes(x.instructor));
  const signals: number[] = [];

  const ig = find(course.instructor_grades);
  const ar =
    aRate(ig as unknown as Record<string, number>) ?? aRate(course.grade_data);
  if (ar != null) signals.push(ar);

  const rmp = find(course.professor_ratings);
  if (rmp?.rmpRating != null) signals.push(rmp.rmpRating / 5);

  const ev = find(course.evaluations);
  if (ev?.instructorRating != null) signals.push(ev.instructorRating / 5);

  return signals.length
    ? signals.reduce((s, x) => s + x, 0) / signals.length
    : 0.5;
};

// 0–1 ease for the section's professor(s): historical A-rate alone (neutral 0.5 when unknown). Used by the "easiest" rank, kept separate from quality so "most A's" differs from "best professor".
const sectionEase = (
  course: RetrievedSection,
  section: CourseSection,
): number => {
  const names = section.instructors ?? [];
  const ig = (course.instructor_grades ?? []).find((x) =>
    names.includes(x.instructor),
  );
  return (
    aRate(ig as unknown as Record<string, number>) ??
    aRate(course.grade_data) ??
    0.5
  );
};

const sectionsOf = (course: RetrievedSection): CourseSection[] =>
  course.course_sections?.length
    ? course.course_sections
    : [
        {
          section_id: course.section_id,
          instructors: course.instructors,
          instruction_mode: course.instruction_mode,
          register_url: course.register_url,
          schedule_days: course.schedule_days,
          schedule_hours: course.schedule_hours,
          schedule_location: course.schedule_location,
        },
      ];

const score = (
  picks: Candidate[],
  prefs: SchedulerPrefs,
  fixed: Meeting[],
): GeneratedSchedule => {
  // Gaps / days-off / earliest reflect the WHOLE week (fixed classes + new picks); quality is the new picks only (fixed classes already exist, we're not choosing their professors).
  const meetings = [...fixed, ...picks.flatMap((p) => p.meetings)];
  const used = new Set<number>();
  let earliest: number | null = null;
  let latest: number | null = null;
  for (const m of meetings) {
    for (const d of m.days) used.add(d);
    earliest = earliest == null ? m.startMin : Math.min(earliest, m.startMin);
    latest = latest == null ? m.endMin : Math.max(latest, m.endMin);
  }
  const daysOff = [0, 1, 2, 3, 4].filter((d) => !used.has(d));

  let gapMinutes = 0;
  for (let d = 0; d <= 4; d++) {
    const day = meetings
      .filter((m) => m.days.includes(d))
      .sort((a, b) => a.startMin - b.startMin);
    for (let i = 1; i < day.length; i++)
      gapMinutes += Math.max(0, day[i]!.startMin - day[i - 1]!.endMin);
  }

  const quality = picks.length
    ? picks.reduce((s, p) => s + p.quality, 0) / picks.length
    : 0.5;
  const ease = picks.length
    ? picks.reduce((s, p) => s + p.ease, 0) / picks.length
    : 0.5;
  const compactness = 1 - Math.min(gapMinutes, 480) / 480; // cap influence at 8h of gaps
  const freeDays = Math.min(daysOff.length / 3, 1); // 3+ class-free weekdays → max
  // Later first class is "better" for the earliest-finish-averse; 8:00→0, 11:00+→1.
  const lateStart =
    earliest == null ? 1 : Math.min(Math.max((earliest - 480) / 180, 0), 1);

  let overall: number;
  if (prefs.rank === "easiest")
    overall = 0.6 * ease + 0.25 * quality + 0.15 * compactness;
  else if (prefs.rank === "compact")
    overall = 0.6 * compactness + 0.4 * quality;
  else if (prefs.rank === "daysoff")
    overall = 0.6 * freeDays + 0.25 * quality + 0.15 * compactness;
  else if (prefs.rank === "earliest")
    overall = 0.55 * lateStart + 0.3 * quality + 0.15 * compactness;
  else overall = 0.6 * quality + 0.3 * compactness + 0.1 * lateStart;

  return {
    picks: picks.map((p) => ({ course: p.course, section: p.section })),
    score: overall,
    quality,
    gapMinutes,
    daysOff,
    earliestStart: earliest,
    latestEnd: latest,
    ease,
  };
};

// Generate ranked, conflict-free schedules from the desired courses. `fixed` is the set of already-scheduled sections to build AROUND (a target schedule's existing classes) — new sections that clash with them are discarded. Courses with no section left after the preferences/fixed are reported in `infeasible` and dropped (the rest are still scheduled), so the caller can explain the gap instead of silently returning nothing.
export function generateSchedules(
  courses: RetrievedSection[],
  prefs: SchedulerPrefs = {},
  fixed: {
    schedule_days: string[] | null;
    schedule_hours: string[] | null;
  }[] = [],
): SchedulerResult {
  const fixedMeetings = fixed.flatMap((f) => meetingsOf(f));
  const groups: { code: string; candidates: Candidate[] }[] = [];
  const infeasible: string[] = [];

  for (const course of courses) {
    const code = courseCode(course.course_header);
    const candidates: Candidate[] = [];
    for (const section of sectionsOf(course)) {
      const meetings = meetingsOf(section);
      if (!passesPrefs(meetings, prefs)) continue;
      if (
        fixedMeetings.some((fm) => meetings.some((m) => meetingsClash(m, fm)))
      )
        continue;
      candidates.push({
        course,
        section,
        meetings,
        quality: sectionQuality(course, section),
        ease: sectionEase(course, section),
      });
    }
    if (candidates.length) groups.push({ code, candidates });
    else infeasible.push(code);
  }

  // Smaller domains first → conflicts prune earlier, keeping the search cheap.
  groups.sort((a, b) => a.candidates.length - b.candidates.length);

  const results: GeneratedSchedule[] = [];
  const chosen: Candidate[] = [];
  let nodes = 0;
  let truncated = false;

  const dfs = (i: number) => {
    if (truncated) return;
    if (i === groups.length) {
      results.push(score(chosen, prefs, fixedMeetings));
      return;
    }
    for (const cand of groups[i]!.candidates) {
      if (++nodes > MAX_NODES) {
        truncated = true;
        return;
      }
      if (chosen.some((c) => candidatesClash(c, cand))) continue;
      chosen.push(cand);
      dfs(i + 1);
      chosen.pop();
      if (truncated) return;
    }
  };
  if (groups.length) dfs(0);

  // When nothing fits, surface which course pairs are mutually impossible (every section clashes).
  const alwaysConflict: [string, string][] = [];
  if (!results.length && groups.length >= 2) {
    for (let a = 0; a < groups.length; a++)
      for (let b = a + 1; b < groups.length; b++)
        if (
          groups[a]!.candidates.every((ca) =>
            groups[b]!.candidates.every((cb) => candidatesClash(ca, cb)),
          )
        )
          alwaysConflict.push([groups[a]!.code, groups[b]!.code]);
  }

  // "desc" surfaces the best matches first (default); "asc" flips to worst-first. The cap is applied after sorting, so each direction keeps the N schedules that best fit it.
  results.sort((a, b) =>
    prefs.rankDir === "asc" ? a.score - b.score : b.score - a.score,
  );

  // Whole-schedule filters (quality / gap can only be judged once every section is picked).
  const inRange = (s: GeneratedSchedule): boolean =>
    (prefs.minQuality == null || s.quality >= prefs.minQuality) &&
    (prefs.maxQuality == null || s.quality <= prefs.maxQuality) &&
    (prefs.minGapMin == null || s.gapMinutes >= prefs.minGapMin) &&
    (prefs.maxGapMin == null || s.gapMinutes <= prefs.maxGapMin);

  return {
    schedules: results.filter(inRange).slice(0, MAX_RESULTS),
    infeasible,
    alwaysConflict,
    truncated,
  };
}

// Shared course parsing/formatting for the chips, add buttons, and calendar grid.

/** "LEWIS, CHARLTON N" -> "Charlton N Lewis" */
export function formatName(raw: string): string {
  const parts = raw.split(",");
  const last = (parts[0] ?? "").trim();
  const rest = parts.slice(1).join(",").trim();
  const ordered = rest ? `${rest} ${last}` : last;
  return ordered
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.split("-").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("-"))
    .join(" ");
}

/** "C S 303E ELEMS OF COMPUTERS" -> "C S 303E" */
export function courseCode(header: string): string {
  const m = header.match(/^(.+?\s\d{1,3}[A-Z]*)\s/);
  return m?.[1] ?? header;
}

/** "10:00 a.m.-11:00 a.m." -> "10:00 AM – 11:00 AM" (display only). */
export function formatHours(raw: string): string {
  return raw
    .replace(/a\.m\./gi, "AM")
    .replace(/p\.m\./gi, "PM")
    .replace(/\s*-\s*/g, " – ")
    .trim();
}

/** "SOFTWARE ENGINEERING" -> "Software Engineering" */
export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Course-number digits = credits (1st) + rank (2nd–3rd: 01–19 lower, 20–79 upper, 80–99 grad).
export function courseMeta(code: string): { credits: number; level: string } | null {
  const m = code.match(/(\d{3})[A-Z]*$/);
  if (!m) return null;
  const digits = m[1]!;
  const rank = Number(digits.slice(1));
  const level = rank <= 19 ? "Lower-division" : rank <= 79 ? "Upper-division" : "Graduate";
  return { credits: Number(digits[0]), level };
}

/** A section's parallel schedule arrays (structural — `CourseSection` satisfies it). */
export type ScheduleArrays = {
  schedule_days: string[] | null;
  schedule_hours: string[] | null;
  schedule_location: string[] | null;
};

/** Meeting rows ("MWF" / hours / location) zipped from a section's parallel schedule arrays. */
export function meetingsOf(sec: ScheduleArrays) {
  return (sec.schedule_days ?? []).map((d, i) => ({
    days: d.trim(),
    hours: formatHours(sec.schedule_hours?.[i] ?? ""),
    location: (sec.schedule_location?.[i] ?? "").trim(),
  }));
}

// Day index convention: 0=Mon … 6=Sun (matches DAY_LABELS in WeeklyGrid).
/** "TTH" -> [1,3] (Tue, Thu). Multi-char tokens are matched before single letters. */
export function parseDays(token: string): number[] {
  const s = (token ?? "").toUpperCase().replace(/[^A-Z]/g, "");
  const out: number[] = [];
  let i = 0;
  while (i < s.length) {
    if (s.startsWith("TH", i)) {
      out.push(3);
      i += 2;
    } else if (s.startsWith("SU", i)) {
      out.push(6);
      i += 2;
    } else {
      const c = s[i];
      i += 1;
      if (c === "M") out.push(0);
      else if (c === "T") out.push(1);
      else if (c === "W") out.push(2);
      else if (c === "F") out.push(4);
      else if (c === "S") out.push(5);
    }
  }
  return out;
}

const TIME_RANGE =
  /(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\s*[–—-]\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)/i;

const toMinutes = (h: string, mm: string | undefined, meridiem: string | undefined): number => {
  let hour = Number(h);
  const minutes = mm ? Number(mm) : 0;
  const ap = (meridiem ?? "").replace(/\./g, "").toLowerCase();
  if (ap === "pm") hour = hour === 12 ? 12 : hour + 12;
  else if (ap === "am") hour = hour === 12 ? 0 : hour;
  return hour * 60 + minutes;
};

// "10:00 a.m.-1:00 p.m." -> {600,780}; null for TBA/empty/online.
export function parseHourRange(raw: string): { startMin: number; endMin: number } | null {
  const m = (raw ?? "").match(TIME_RANGE);
  if (!m) return null;
  const endMer = m[6];
  // Prose may omit the start meridiem ("10–11am") — infer from the end, fix if start lands after end.
  let startMin = toMinutes(m[1]!, m[2], m[3] || endMer);
  const endMin = toMinutes(m[4]!, m[5], endMer);
  if (!m[3] && startMin >= endMin) {
    const alt = toMinutes(m[1]!, m[2], "am");
    if (alt < endMin) startMin = alt;
  }
  return { startMin, endMin };
}

/** 540 -> "9:00 AM". */
export function minuteLabel(min: number): string {
  let h = Math.floor(min / 60);
  const m = min % 60;
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")} ${ap}`;
}

// Fixed palette so the same course is always the same color across chips, blocks, and schedules.
const COURSE_COLORS = [
  { bg: "bg-blue-500/40", border: "border-blue-500/50", text: "text-blue-700 dark:text-blue-300", dot: "bg-blue-500" },
  { bg: "bg-emerald-500/40", border: "border-emerald-500/50", text: "text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500" },
  { bg: "bg-violet-500/40", border: "border-violet-500/50", text: "text-violet-700 dark:text-violet-300", dot: "bg-violet-500" },
  { bg: "bg-amber-500/40", border: "border-amber-500/50", text: "text-amber-700 dark:text-amber-300", dot: "bg-amber-500" },
  { bg: "bg-pink-500/40", border: "border-pink-500/50", text: "text-pink-700 dark:text-pink-300", dot: "bg-pink-500" },
  { bg: "bg-cyan-500/40", border: "border-cyan-500/50", text: "text-cyan-700 dark:text-cyan-300", dot: "bg-cyan-500" },
  { bg: "bg-orange-500/40", border: "border-orange-500/50", text: "text-orange-700 dark:text-orange-300", dot: "bg-orange-500" },
  { bg: "bg-teal-500/40", border: "border-teal-500/50", text: "text-teal-700 dark:text-teal-300", dot: "bg-teal-500" },
] as const;

export type CourseColor = (typeof COURSE_COLORS)[number];

export function courseColor(code: string): CourseColor {
  let hash = 0;
  for (let i = 0; i < code.length; i++) hash = (hash * 31 + code.charCodeAt(i)) | 0;
  return COURSE_COLORS[Math.abs(hash) % COURSE_COLORS.length]!;
}

/** Palette color by index (wraps). */
export function colorAt(index: number): CourseColor {
  const n = COURSE_COLORS.length;
  return COURSE_COLORS[((index % n) + n) % n]!;
}

/** A random palette index, preferring colors not already used by `existing` items. */
export function pickColorIndex(existing: { color?: number | null }[]): number {
  const used = new Set(existing.map((s) => s.color).filter((c): c is number => typeof c === "number"));
  const free: number[] = [];
  for (let i = 0; i < COURSE_COLORS.length; i++) if (!used.has(i)) free.push(i);
  const pool = free.length ? free : COURSE_COLORS.map((_, i) => i);
  return pool[Math.floor(Math.random() * pool.length)]!;
}

// Hex palettes (Tailwind 500/300/700) parallel to COURSE_COLORS, for canvas rendering (PNG export).
const COURSE_HEX = ["#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#ec4899", "#06b6d4", "#f97316", "#14b8a6"];
const COURSE_HEX_300 = ["#93c5fd", "#6ee7b7", "#c4b5fd", "#fcd34d", "#f9a8d4", "#67e8f9", "#fdba74", "#5eead4"];
const COURSE_HEX_700 = ["#1d4ed8", "#047857", "#6d28d9", "#b45309", "#be185d", "#0e7490", "#c2410c", "#0f766e"];

// A saved section's palette index (matches courseColor/colorAt).
export function colorIndexFor(s: { color?: number | null; course_code: string }): number {
  if (s.color != null) return ((s.color % COURSE_HEX.length) + COURSE_HEX.length) % COURSE_HEX.length;
  let hash = 0;
  for (let i = 0; i < s.course_code.length; i++) hash = (hash * 31 + s.course_code.charCodeAt(i)) | 0;
  return Math.abs(hash) % COURSE_HEX.length;
}

export function courseHexShade(index: number, shade: 300 | 500 | 700): string {
  const arr = shade === 300 ? COURSE_HEX_300 : shade === 700 ? COURSE_HEX_700 : COURSE_HEX;
  return arr[((index % arr.length) + arr.length) % arr.length]!;
}

// Side-by-side lanes for time-ranged items (courses + time blocks share a day's width, GCal-style).
export function assignLanes<T extends { startMin: number; endMin: number }>(
  items: T[]
): Array<T & { lane: number; lanes: number }> {
  const sorted = items
    .slice()
    .sort((a, z) => a.startMin - z.startMin || a.endMin - z.endMin)
    .map((x) => ({ ...x, lane: 0, lanes: 1 }));
  let i = 0;
  while (i < sorted.length) {
    let end = i + 1;
    let maxEnd = sorted[i]!.endMin;
    while (end < sorted.length && sorted[end]!.startMin < maxEnd) {
      maxEnd = Math.max(maxEnd, sorted[end]!.endMin);
      end++;
    }
    const cluster = sorted.slice(i, end);
    const laneEnds: number[] = [];
    for (const b of cluster) {
      let lane = laneEnds.findIndex((e) => e <= b.startMin);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(b.endMin);
      } else {
        laneEnds[lane] = b.endMin;
      }
      b.lane = lane;
    }
    for (const b of cluster) b.lanes = laneEnds.length;
    i = end;
  }
  return sorted;
}

export type SemesterGrades = { semester: string; grades: Record<string, number> };

export type ProfessorRating = {
  instructor: string;
  rmpLegacyId: number;
  rmpRating: number | null;
  rmpDifficulty: number | null;
  rmpWouldTakeAgain: number | null;
  rmpNumRatings: number | null;
  rmpDepartment: string | null;
  rmpCourse?: {
    code: string;
    rating: number;
    difficulty: number;
    wouldTakeAgain: number | null;
    numRatings: number;
  } | null;
};

/** One offered section of a course (the chip collapses a course's sections; the dialog lists them). */
export type CourseSection = {
  section_id: number;
  instructors: string[];
  instruction_mode: string | null;
  register_url: string | null;
  schedule_days: string[] | null;
  schedule_hours: string[] | null;
  schedule_location: string[] | null;
};

/** A course as returned by `match_sections_detailed` and attached to the assistant message. */
export type RetrievedSection = {
  section_id: number;
  course_header: string;
  description?: string | null;
  instructors: string[];
  instruction_mode: string | null;
  register_url: string | null;
  schedule_days: string[] | null;
  schedule_hours: string[] | null;
  schedule_location: string[] | null;
  core_curriculum: string[] | null;
  grade_data: Record<string, number> | null;
  instructor_grades: Array<{ instructor: string } & Record<string, number>> | null;
  semester_grades: SemesterGrades[] | null;
  evaluations: Array<{
    instructor: string;
    courseRating: number;
    instructorRating: number;
    responseRate: number;
    cesLink: string;
  }> | null;
  professor_ratings?: ProfessorRating[] | null;
  course_sections?: CourseSection[] | null;
};

// Saved schedule item; `detail` is the full course payload (captured on add) for the dialog.
export type ScheduleSection = {
  section_id: number;
  course_code: string;
  course_title: string;
  instructors: string[];
  instruction_mode: string | null;
  register_url: string | null;
  meetings: { days: string; hours: string; location: string }[];
  detail?: RetrievedSection | null;
  /** Palette index assigned (randomly) when added to a schedule. */
  color?: number | null;
};

/** A user-defined busy time on a schedule (lunch, work, commute, …). */
export type TimeBlock = {
  id: string;
  label: string;
  days: number[];
  startMin: number;
  endMin: number;
};

/** Course codes whose meetings overlap this section's (same day + overlapping time range). */
export function sectionCourseConflicts(section: ScheduleSection, others: ScheduleSection[]): string[] {
  const mine = section.meetings
    .map((m) => ({ days: parseDays(m.days), range: parseHourRange(m.hours) }))
    .filter((x) => x.range && x.days.length > 0);
  const hits = new Set<string>();
  for (const o of others) {
    if (o.section_id === section.section_id) continue;
    for (const m of o.meetings) {
      const days = parseDays(m.days);
      const range = parseHourRange(m.hours);
      if (!range || days.length === 0) continue;
      for (const mm of mine) {
        if (
          mm.range &&
          mm.days.some((d) => days.includes(d)) &&
          mm.range.startMin < range.endMin &&
          range.startMin < mm.range.endMin
        ) {
          hits.add(o.course_code);
        }
      }
    }
  }
  return Array.from(hits);
}

/** Labels of the time blocks a section's meetings overlap (same day + overlapping time range). */
export function sectionBlockConflicts(section: ScheduleSection, blocks: TimeBlock[]): string[] {
  const labels = new Set<string>();
  for (const m of section.meetings) {
    const range = parseHourRange(m.hours);
    const days = parseDays(m.days);
    if (!range || !days.length) continue;
    for (const b of blocks) {
      const dayHit = b.days.some((d) => days.includes(d));
      const timeHit = range.startMin < b.endMin && b.startMin < range.endMin;
      if (dayHit && timeHit) labels.add(b.label);
    }
  }
  return Array.from(labels);
}

// Build a saved ScheduleSection (raw meeting strings + full `detail`) from a course + section.
export function toScheduleSection(s: RetrievedSection, sec: CourseSection): ScheduleSection {
  const code = courseCode(s.course_header);
  return {
    section_id: sec.section_id,
    course_code: code,
    course_title: titleCase(s.course_header.slice(code.length).trim()),
    instructors: sec.instructors.map(formatName).filter(Boolean),
    instruction_mode: sec.instruction_mode,
    register_url: sec.register_url,
    meetings: (sec.schedule_days ?? []).map((d, i) => ({
      days: (d ?? "").trim(),
      hours: (sec.schedule_hours?.[i] ?? "").trim(),
      location: (sec.schedule_location?.[i] ?? "").trim(),
    })),
    detail: s,
  };
}

// Minimal RetrievedSection — dialog fallback for items saved before `detail` existed.
export function scheduleSectionToRetrieved(s: ScheduleSection): RetrievedSection {
  const arrays = {
    schedule_days: s.meetings.map((m) => m.days),
    schedule_hours: s.meetings.map((m) => m.hours),
    schedule_location: s.meetings.map((m) => m.location),
  };
  return {
    section_id: s.section_id,
    course_header: `${s.course_code} ${s.course_title}`.trim(),
    description: null,
    instructors: s.instructors,
    instruction_mode: s.instruction_mode,
    register_url: s.register_url,
    ...arrays,
    core_curriculum: null,
    grade_data: null,
    instructor_grades: null,
    semester_grades: null,
    evaluations: null,
    professor_ratings: null,
    course_sections: [{ section_id: s.section_id, instructors: s.instructors, instruction_mode: s.instruction_mode, register_url: s.register_url, ...arrays }],
  };
}

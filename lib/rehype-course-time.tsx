"use client";

import type { Components } from "react-markdown";
import { extractCourses } from "@/components/CourseChips";
import {
  parseDays,
  parseHourRange,
  toScheduleSection,
  type ScheduleSection,
  type RetrievedSection,
  type CourseSection,
} from "@/lib/courses";
import AddToSchedule from "@/components/AddToSchedule";

// Minimal hast shape (avoids pulling in @types/hast, which pnpm doesn't hoist here).
type HastNode = {
  type: string;
  value?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

type TimeMatch = { key: string; startMin: number; endMin: number; days: number[] };

export type CourseTimeData = {
  matches: TimeMatch[];
  sectionByKey: Record<string, ScheduleSection>;
};

// Optional day token + time range; end meridiem required so partial/non-time ranges don't match.
const TIME_RANGE_RE =
  /(?:\b((?:TH|SU|M|T|W|F|S){1,7})\s+)?(\d{1,2}(?::\d{2})?\s*(?:[AaPp]\.?[Mm]\.?)?\s*[–—-]\s*\d{1,2}(?::\d{2})?\s*[AaPp]\.?[Mm]\.?)/g;

/** Build the time-match index + key→section map from a message's annotations. */
export function buildCourseTime(annotations?: unknown[]): CourseTimeData {
  const sections = extractCourses(annotations);
  const matches: TimeMatch[] = [];
  const sectionByKey: Record<string, ScheduleSection> = {};

  for (const s of sections) {
    const courseSections: CourseSection[] = s.course_sections?.length
      ? s.course_sections
      : [
          {
            section_id: s.section_id,
            instructors: s.instructors,
            instruction_mode: s.instruction_mode,
            register_url: s.register_url,
            schedule_days: s.schedule_days,
            schedule_hours: s.schedule_hours,
            schedule_location: s.schedule_location,
          },
        ];
    for (const sec of courseSections) {
      const sched = toScheduleSection(s, sec);
      (sec.schedule_days ?? []).forEach((d, i) => {
        const range = parseHourRange(sec.schedule_hours?.[i] ?? "");
        if (!range) return;
        const key = `${sec.section_id}#${i}`;
        matches.push({ key, startMin: range.startMin, endMin: range.endMin, days: parseDays(d) });
        sectionByKey[key] = sched;
      });
    }
  }
  return { matches, sectionByKey };
}

function findKey(matchedText: string, dayToken: string | undefined, matches: TimeMatch[]): string | null {
  const range = parseHourRange(matchedText);
  if (!range) return null;
  const dayIdxs = dayToken ? parseDays(dayToken) : [];
  const dayOk = (m: TimeMatch) => dayIdxs.length === 0 || m.days.some((d) => dayIdxs.includes(d));
  const exact = matches.find((m) => m.startMin === range.startMin && m.endMin === range.endMin && dayOk(m));
  if (exact) return exact.key;
  const byStart = matches.find((m) => m.startMin === range.startMin && dayOk(m));
  return byStart?.key ?? null;
}

function splitTextNode(value: string, matches: TimeMatch[]): HastNode[] {
  TIME_RANGE_RE.lastIndex = 0;
  const out: HastNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = TIME_RANGE_RE.exec(value)) !== null) {
    const full = m[0];
    const key = findKey(full, m[1], matches);
    if (key) {
      if (m.index > last) out.push({ type: "text", value: value.slice(last, m.index) });
      out.push({
        type: "element",
        tagName: "course-time",
        properties: { matchKey: key },
        children: [{ type: "text", value: full }],
      });
      last = m.index + full.length;
    }
  }
  if (out.length === 0) return [{ type: "text", value }];
  if (last < value.length) out.push({ type: "text", value: value.slice(last) });
  return out;
}

// Rehype plugin: insert a (+) after each meeting time that maps to a section.
export function rehypeCourseTime({ matches }: { matches: TimeMatch[] }) {
  return (tree: HastNode) => {
    if (!matches.length) return;
    const walk = (node: HastNode) => {
      if (!node.children) return;
      const next: HastNode[] = [];
      for (const child of node.children) {
        if (child.type === "text" && typeof child.value === "string") {
          next.push(...splitTextNode(child.value, matches));
        } else {
          walk(child);
          next.push(child);
        }
      }
      node.children = next;
    };
    walk(tree);
  };
}

/** Component map rendering the injected `<course-time>` nodes as the prose time + an inline (+). */
export function makeCourseTimeComponents(sectionByKey: Record<string, ScheduleSection>): Components {
  const CourseTime = ({ node, children }: { node?: HastNode; children?: React.ReactNode }) => {
    const key = node?.properties?.matchKey as string | undefined;
    const section = key ? sectionByKey[key] : undefined;
    return (
      <span className="whitespace-nowrap">
        {children}
        {section && <AddToSchedule section={section} className="mx-1.5 -translate-y-px" />}
      </span>
    );
  };
  return { "course-time": CourseTime } as unknown as Components;
}

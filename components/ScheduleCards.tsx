"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/utils/supabase/client";
import { fetchCourseBySection } from "@/lib/browse";
import {
  parseDays,
  parseHourRange,
  minuteLabel,
  colorAt,
  lastName,
  courseCode,
  scheduleSectionToRetrieved,
  type ScheduleSection,
  type RetrievedSection,
} from "@/lib/courses";
import { useSchedules } from "@/lib/schedules";
import { useToast } from "@/components/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { ToastAction, type ToastActionElement } from "@/components/ui/toast";
import { CourseDialog } from "@/components/CourseChips";

// One generated schedule + its stats, as emitted by the Worker's buildSchedule tool.
export type ScheduleOption = {
  sections: ScheduleSection[];
  quality: number; // 0–1 mean professor quality
  ease: number; // 0–1 mean grade leniency (avg GPA / 4)
  gpa: number | null; // mean average GPA (0–4) across picks
  daysOff: string[]; // e.g. ["Friday"]
  gapHours: number;
  earliestStart: string | null; // e.g. "12:30 PM"
};

/** Pull the schedule options out of a message's annotations (written by the Worker). */
export function extractSchedules(annotations?: unknown[]): ScheduleOption[] {
  const a = (annotations ?? []).find(
    (x): x is { type: string; options: ScheduleOption[] } =>
      !!x && typeof x === "object" && (x as { type?: string }).type === "schedule"
  );
  return a?.options ?? [];
}

/** Full course detail (for the click-through dialog) carried alongside the options. */
export function extractScheduleCourses(annotations?: unknown[]): RetrievedSection[] {
  const a = (annotations ?? []).find(
    (x): x is { type: string; courses?: RetrievedSection[] } =>
      !!x && typeof x === "object" && (x as { type?: string }).type === "schedule"
  );
  return a?.courses ?? [];
}

const normCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOUR_PX = 48;

// Read-only week preview of one schedule — mirrors BuildView's PreviewGrid, fit to the actual class hours.
function MiniWeeklyGrid({ sections }: { sections: ScheduleSection[] }) {
  const [supabase] = useState(() => createClient());
  const [selected, setSelected] = useState<RetrievedSection | null>(null);
  const openKey = useRef<number | null>(null);

  // Open the snapshot, then fetch THIS section's course by section_id (codes like UGS 303 span many topics).
  const openCourse = async (s: ScheduleSection) => {
    openKey.current = s.section_id;
    setSelected(s.detail ?? scheduleSectionToRetrieved(s));
    try {
      const full = await fetchCourseBySection(supabase, s.section_id);
      if (full && openKey.current === s.section_id) setSelected(full);
    } catch {
      // keep the fallback
    }
  };
  const closeDialog = () => {
    openKey.current = null;
    setSelected(null);
  };
  const { blocks, days, online, minH, maxH } = useMemo(() => {
    type Blk = {
      day: number;
      startMin: number;
      endMin: number;
      code: string;
      prof: string;
      location: string;
      colorIdx: number;
      source: ScheduleSection;
    };
    const blocks: Blk[] = [];
    const online: string[] = [];
    sections.forEach((s, i) => {
      const code = s.course_code.replace(/\s+/g, "");
      const colorIdx = s.color ?? i;
      const prof = s.instructors[0] ? lastName(s.instructors[0]) : "";
      let placed = false;
      for (const m of s.meetings) {
        const r = parseHourRange(m.hours);
        const dd = parseDays(m.days);
        if (!r || !dd.length) continue;
        placed = true;
        for (const d of dd)
          blocks.push({ day: d, startMin: r.startMin, endMin: r.endMin, code, prof, location: (m.location ?? "").trim(), colorIdx, source: s });
      }
      if (!placed) online.push(code);
    });
    const used = new Set(blocks.map((b) => b.day));
    const days = [5, 6].some((d) => used.has(d)) ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4];
    const minH = blocks.length ? Math.floor(Math.min(...blocks.map((b) => b.startMin)) / 60) : 8;
    const maxH = blocks.length ? Math.ceil(Math.max(...blocks.map((b) => b.endMin)) / 60) : 18;
    return { blocks, days, online, minH, maxH };
  }, [sections]);

  const top0 = minH * 60;
  const totalHeight = (maxH - minH) * HOUR_PX;
  const hours = Array.from({ length: maxH - minH + 1 }, (_, i) => minH + i);

  return (
    <>
      <div className="rounded-md border p-2">
      <div className="flex">
        <div className="w-12 shrink-0" />
        {days.map((d) => (
          <div key={d} className="flex-1 pb-1 text-center text-[11px] font-medium text-muted-foreground">
            {DAY_LABELS[d]}
          </div>
        ))}
      </div>
      <div className="flex" style={{ height: totalHeight }}>
        <div className="relative w-12 shrink-0">
          {hours.map((h, i) => (
            <div
              key={h}
              className="absolute right-1.5 -translate-y-1/2 whitespace-nowrap text-[10px] text-muted-foreground"
              style={{ top: i * HOUR_PX }}
            >
              {i === 0 ? "" : minuteLabel(h * 60)}
            </div>
          ))}
        </div>
        <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
          {days.map((d) => (
            <div key={d} className="relative border-l" style={{ height: totalHeight }}>
              {hours.map((h, i) => (
                <div key={h} className="pointer-events-none absolute inset-x-0 border-t border-border/40" style={{ top: i * HOUR_PX }} />
              ))}
              {blocks
                .filter((b) => b.day === d)
                .map((b, i) => {
                  const c = colorAt(b.colorIdx);
                  const h = Math.max(((b.endMin - b.startMin) / 60) * HOUR_PX - 2, 18);
                  return (
                    <div
                      key={i}
                      role="button"
                      tabIndex={0}
                      onClick={() => openCourse(b.source)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openCourse(b.source);
                        }
                      }}
                      className={cn(
                        "absolute inset-x-0.5 cursor-pointer overflow-hidden rounded-md px-1.5 py-1 text-[11px] leading-tight outline-none focus-visible:ring-2 focus-visible:ring-texas/40",
                        c.bg,
                        c.text
                      )}
                      style={{ top: ((b.startMin - top0) / 60) * HOUR_PX + 1, height: h }}
                      title={`${b.code}${b.prof ? ` - ${b.prof}` : ""} · ${minuteLabel(b.startMin)}–${minuteLabel(b.endMin)}${b.location ? ` · ${b.location}` : ""}`}
                    >
                      <div className="truncate font-semibold">
                        {b.code}
                        {b.prof ? ` - ${b.prof}` : ""}
                      </div>
                      {h >= 30 && (
                        <div className="truncate opacity-80">
                          {minuteLabel(b.startMin)}–{minuteLabel(b.endMin)}
                        </div>
                      )}
                      {b.location && h >= 44 && <div className="truncate opacity-60">{b.location}</div>}
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
      </div>
      {online.length > 0 && (
        <p className="mt-2 text-[11px] text-muted-foreground">No set meeting time: {online.join(", ")}</p>
      )}
      </div>
      <CourseDialog section={selected} onClose={closeDialog} />
    </>
  );
}

// Stat pill matching BuildView's ResultCard (bold label + value, rounded-full border).
function Pill({ label, value }: { label: string; value: string }) {
  return (
    <span className="whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[11px] text-muted-foreground">
      <span className="font-semibold">{label}:</span> {value}
    </span>
  );
}

function ScheduleCard({
  option,
  index,
  detailByCode,
}: {
  option: ScheduleOption;
  index: number;
  detailByCode: Map<string, RetrievedSection>;
}) {
  const { createSchedule, addSection, setActiveId } = useSchedules();
  const { toast } = useToast();
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");

  // Color each course by position to match the saved schedule, and re-attach full detail for the dialog + save.
  const sections = useMemo(
    () =>
      option.sections.map((s, i) => ({
        ...s,
        color: s.color ?? i,
        detail: s.detail ?? detailByCode.get(normCode(s.course_code)) ?? null,
      })),
    [option.sections, detailByCode]
  );
  const name = useMemo(() => {
    const codes = Array.from(new Set(sections.map((s) => s.course_code)));
    return codes.join(" · ").slice(0, 60) || `Schedule ${index + 1}`;
  }, [sections, index]);

  const off = option.daysOff.length ? option.daysOff.map((d) => d.slice(0, 3)).join(" ") : "None";
  const gaps =
    option.gapHours >= 1
      ? `${String(option.gapHours).replace(/\.0$/, "")}h/week`
      : `${Math.round(option.gapHours * 60)}m/week`;

  const onSave = async () => {
    setState("saving");
    const row = await createSchedule(name); // surfaces its own error toast on failure
    if (!row) {
      setState("idle");
      return;
    }
    for (const s of sections) await addSection(row.id, s);
    setActiveId(row.id); // the calendar reads this from the shared store on arrival
    setState("saved");
    toast({
      title: `Saved “${name}”`,
      description: `${sections.length} ${sections.length === 1 ? "course" : "courses"} · on your Calendar`,
      action: ((
        <ToastAction altText="View schedule" onClick={() => router.push("/calendar")}>
          View
        </ToastAction>
      ) as unknown) as ToastActionElement,
    });
  };

  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="mr-0.5 text-xs font-semibold">Option {index + 1}</span>
        {option.gpa != null && <Pill label="GPA" value={option.gpa.toFixed(2)} />}
        {option.quality > 0 && <Pill label="Prof" value={`${(option.quality * 5).toFixed(1)}/5`} />}
        <Pill label="Days Off" value={off} />
        <Pill label="Gap" value={gaps} />
      </div>

      <MiniWeeklyGrid sections={sections} />

      <div className="mt-2 flex justify-end">
        {state === "saved" ? (
          <Button size="sm" variant="ghost" onClick={() => router.push("/calendar")} className="gap-1.5">
            <Check className="h-3.5 w-3.5" /> Saved · View on calendar
          </Button>
        ) : (
          <Button size="sm" onClick={onSave} disabled={state === "saving"} className="gap-1.5 bg-texas text-white hover:bg-texas/90">
            {state === "saving" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarPlus className="h-3.5 w-3.5" />}
            Save this schedule
          </Button>
        )}
      </div>
    </div>
  );
}

export default function ScheduleCards({ annotations }: { annotations?: unknown[] }) {
  const options = extractSchedules(annotations);
  const courses = extractScheduleCourses(annotations);
  const detailByCode = useMemo(
    () => new Map(courses.map((c) => [normCode(courseCode(c.course_header)), c] as const)),
    [courses]
  );
  if (!options.length) return null;
  return (
    <div className="mt-3 space-y-3 not-prose">
      {options.map((o, i) => (
        <ScheduleCard key={i} option={o} index={i} detailByCode={detailByCode} />
      ))}
    </div>
  );
}

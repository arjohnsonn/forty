"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";

/** A section as returned by the `match_sections_detailed` RPC and attached to the assistant message. */
export type RetrievedSection = {
  section_id: number;
  course_header: string;
  instructors: string[];
  instruction_mode: string | null;
  register_url: string | null;
  schedule_days: string[] | null;
  schedule_hours: string[] | null;
  schedule_location: string[] | null;
  core_curriculum: string[] | null;
  grade_data: Record<string, number> | null;
  instructor_grades: Array<{ instructor: string } & Record<string, number>> | null;
  evaluations: Array<{
    instructor: string;
    courseRating: number;
    instructorRating: number;
    responseRate: number;
    cesLink: string;
  }> | null;
};

const BUCKETS = ["A", "B", "C", "D", "F", "Other"] as const;
const BUCKET_COLOR: Record<string, string> = {
  A: "bg-emerald-500",
  B: "bg-lime-500",
  C: "bg-yellow-500",
  D: "bg-orange-500",
  F: "bg-red-500",
  Other: "bg-muted-foreground/40",
};

/** Pull the course sections out of a message's annotations (written by the Worker). */
function extractCourses(annotations?: unknown[]): RetrievedSection[] {
  const a = (annotations ?? []).find(
    (x): x is { type: string; sections: RetrievedSection[] } =>
      !!x && typeof x === "object" && (x as { type?: string }).type === "courses"
  );
  return a?.sections ?? [];
}

// "LEWIS, CHARLTON N" -> "Charlton N Lewis" 
function formatName(raw: string): string {
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

// "C S 303E ELEMS OF COMPUTERS" -> "C S 303E"
function courseCode(header: string): string {
  const m = header.match(/^(.+?\s\d{1,3}[A-Z]*)\s/);
  return m?.[1] ?? header;
}

// "10:00 a.m.-11:00 a.m." -> "10:00 AM – 11:00 AM"
function formatHours(raw: string): string {
  return raw
    .replace(/a\.m\./gi, "AM")
    .replace(/p\.m\./gi, "PM")
    .replace(/\s*-\s*/g, " – ")
    .trim();
}

// "SOFTWARE ENGINEERING" -> "Software Engineering"
function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
}

function gradePercents(g: Record<string, number> | null) {
  if (!g) return null;
  const total = BUCKETS.reduce((n, b) => n + (g[b] ?? 0), 0);
  if (!total) return null;
  return BUCKETS.map((b) => ({
    b,
    count: g[b] ?? 0,
    pct: Math.round(((g[b] ?? 0) / total) * 100),
  })).filter((x) => x.pct > 0);
}

function GradeBar({ grades }: { grades: Record<string, number> | null }) {
  const parts = gradePercents(grades);
  if (!parts) return <span className="text-xs text-muted-foreground">No grade data</span>;
  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full">
        {parts.map((p) => (
          <Tooltip key={p.b}>
            <TooltipTrigger asChild>
              <div className={BUCKET_COLOR[p.b] ?? "bg-muted"} style={{ width: `${p.pct}%` }} />
            </TooltipTrigger>
            <TooltipContent>
              {p.count} {p.count === 1 ? "student" : "students"} received {p.b == "A" ? "an" : "a"} {p.b}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        {parts.map((p) => (
          <span key={p.b}>
            {p.b} {p.pct}%
          </span>
        ))}
      </div>
    </div>
  );
}

function CourseDetail({ s }: { s: RetrievedSection }) {
  const code = courseCode(s.course_header);
  const name = titleCase(s.course_header.slice(code.length).trim());
  const instructors = s.instructors.map(formatName).filter(Boolean);
  const meetings = (s.schedule_days ?? []).map((d, i) => ({
    days: d.trim(),
    hours: formatHours(s.schedule_hours?.[i] ?? ""),
    location: (s.schedule_location?.[i] ?? "").trim(),
  }));
  const core = (s.core_curriculum ?? []).map((c) => c.trim()).filter(Boolean);
  const evalByInstructor = new Map((s.evaluations ?? []).map((e) => [e.instructor, e]));

  return (
    <TooltipProvider delayDuration={100}>
    <div className="space-y-5">
      <DialogHeader className="space-y-1 text-left">
        {name && (
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {code}
          </p>
        )}
        <DialogTitle className="pr-6 text-xl leading-tight">{name || code}</DialogTitle>
      </DialogHeader>

      {(s.instruction_mode || core.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {s.instruction_mode && <Badge variant="secondary">{s.instruction_mode}</Badge>}
          {core.map((c) => (
            <Badge key={c} variant="outline">{c}</Badge>
          ))}
        </div>
      )}

      {instructors.length > 0 && (
        <p className="text-sm">
          <span className="text-muted-foreground">Taught by </span>
          {instructors.join(", ")}
        </p>
      )}

      <section className="space-y-1.5">
        <SectionLabel>{meetings.length ? "Meets" : "Schedule"}</SectionLabel>
        {meetings.length ? (
          meetings.map((m, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
              {m.days && (
                <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium tracking-wide">
                  {m.days}
                </span>
              )}
              {m.hours && <span>{m.hours}</span>}
              {m.location && <span className="text-muted-foreground">{m.location}</span>}
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No scheduled meeting times</p>
        )}
      </section>

      <section className="space-y-2">
        <SectionLabel>Grade distribution</SectionLabel>
        <GradeBar grades={s.grade_data} />
      </section>

      {s.instructor_grades && s.instructor_grades.length > 0 && (
        <section className="space-y-2">
          <SectionLabel>By professor</SectionLabel>
          {s.instructor_grades.map((ig) => {
            const ev = evalByInstructor.get(ig.instructor);
            return (
              <div key={ig.instructor} className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{formatName(ig.instructor)}</span>
                  {ev && (ev.courseRating > 0 || ev.instructorRating > 0) && (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      CES {ev.courseRating}/5 · prof {ev.instructorRating}/5
                    </span>
                  )}
                </div>
                <GradeBar grades={ig} />
              </div>
            );
          })}
        </section>
      )}

      {s.register_url && (
        <Button
          className="w-full"
          onClick={() => window.open(s.register_url!, "_blank", "noopener,noreferrer")}
        >
          View on UT Registration
        </Button>
      )}
    </div>
    </TooltipProvider>
  );
}

export default function CourseChips({ annotations }: { annotations?: unknown[] }) {
  const sections = extractCourses(annotations);
  const [selected, setSelected] = useState<RetrievedSection | null>(null);
  if (!sections.length) return null;

  return (
    <>
      <div className="mt-3 flex flex-wrap gap-2 not-prose">
        {sections.map((s) => (
          <button
            key={s.section_id}
            type="button"
            onClick={() => setSelected(s)}
            className="rounded-full border bg-background px-3 py-1 text-xs transition-colors hover:bg-muted"
          >
            <span className="font-medium">{courseCode(s.course_header)}</span>
            {s.instructors[0] && (
              <span className="text-muted-foreground">
                {" · "}
                {formatName(s.instructors[0])}
                {s.instructors.length > 1 ? ` +${s.instructors.length - 1}` : ""}
              </span>
            )}
          </button>
        ))}
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>{selected && <CourseDetail s={selected} />}</DialogContent>
      </Dialog>
    </>
  );
}

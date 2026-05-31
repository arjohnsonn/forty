"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export type SemesterGrades = { semester: string; grades: Record<string, number> };

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
  semester_grades: SemesterGrades[] | null;
  evaluations: Array<{
    instructor: string;
    courseRating: number;
    instructorRating: number;
    responseRate: number;
    cesLink: string;
  }> | null;
  course_sections?: CourseSection[] | null;
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

function GradeBar({ grades }: { grades: Record<string, number> | null }) {
  const total = grades ? BUCKETS.reduce((n, b) => n + (grades[b] ?? 0), 0) : 0;
  if (!grades || !total) return <span className="text-xs text-muted-foreground">No grade data</span>;
  
  const parts = BUCKETS.map((b) => {
    const count = grades[b] ?? 0;
    return { b, count, width: (count / total) * 100, pct: Math.round((count / total) * 100) };
  });
  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full">
        {parts.map((p) => (
          <Tooltip key={p.b}>
            <TooltipTrigger asChild>
              <motion.div
                className={BUCKET_COLOR[p.b] ?? "bg-muted"}
                initial={false}
                animate={{ width: `${p.width}%` }}
                transition={{ duration: 0.35, ease: "easeInOut" }}
              />
            </TooltipTrigger>
            <TooltipContent>
              {p.count} {p.count === 1 ? "student" : "students"} received {p.b == "A" ? "an" : "a"} {p.b}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        {parts
          .filter((p) => p.pct > 0)
          .map((p) => (
            <span key={p.b}>
              <span className="font-semibold text-foreground">{p.b}</span> {p.pct}%
            </span>
          ))}
      </div>
    </div>
  );
}

const SEASON_ORDER: Record<string, number> = { Spring: 1, Summer: 2, Fall: 3 };
// "Fall 2024" -> sortable number (most recent = largest).
function semesterValue(s: string): number {
  const [season, year] = s.split(" ");
  return Number(year) * 10 + (SEASON_ORDER[season ?? ""] ?? 0);
}

function sumGrades(list: SemesterGrades[]): Record<string, number> {
  const total: Record<string, number> = {};
  for (const { grades } of list) {
    for (const b of BUCKETS) total[b] = (total[b] ?? 0) + (grades?.[b] ?? 0);
  }
  return total;
}

const AGGREGATE = "aggregate";

/** Grade distribution with a single dropdown: Aggregate or any semester (data spans Fall 2020 on). */
function CourseGrades({
  aggregate,
  semesters,
}: {
  aggregate: Record<string, number> | null;
  semesters: SemesterGrades[];
}) {
  const sorted = [...semesters].sort((a, z) => semesterValue(z.semester) - semesterValue(a.semester));
  const hasSemesters = sorted.length > 0;
  const [selected, setSelected] = useState(AGGREGATE);

  const aggGrades = hasSemesters ? sumGrades(sorted) : aggregate;
  const grades = selected === AGGREGATE ? aggGrades : sorted.find((s) => s.semester === selected)?.grades ?? null;

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <SectionLabel>Grade distribution</SectionLabel>
        {hasSemesters && (
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted">
              {selected === AGGREGATE ? "Aggregate" : selected}
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-64">
              <DropdownMenuRadioGroup value={selected} onValueChange={setSelected}>
                <DropdownMenuRadioItem value={AGGREGATE} className="text-xs">
                  Aggregate
                </DropdownMenuRadioItem>
                {sorted.map((s) => (
                  <DropdownMenuRadioItem key={s.semester} value={s.semester} className="text-xs">
                    {s.semester}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <GradeBar grades={grades} />
    </section>
  );
}

// UT course numbers encode credits + level: 1st digit = semester credit hours; 2nd–3rd digits =
// rank (01–19 lower-division, 20–79 upper-division, 80–99 graduate). e.g. "C S 329E" -> 3 cr, upper.
function courseMeta(code: string): { credits: number; level: string } | null {
  const m = code.match(/(\d{3})[A-Z]*$/);
  if (!m) return null;
  const digits = m[1]!;
  const rank = Number(digits.slice(1));
  const level = rank <= 19 ? "Lower-division" : rank <= 79 ? "Upper-division" : "Graduate";
  return { credits: Number(digits[0]), level };
}

/** Meeting rows ("MWF" / hours / location) from a section's parallel schedule arrays. */
function meetingsOf(sec: CourseSection) {
  return (sec.schedule_days ?? []).map((d, i) => ({
    days: d.trim(),
    hours: formatHours(sec.schedule_hours?.[i] ?? ""),
    location: (sec.schedule_location?.[i] ?? "").trim(),
  }));
}

function RegisterLink({ sec }: { sec: CourseSection }) {
  if (!sec.register_url) return <span className="text-xs text-muted-foreground">#{sec.section_id}</span>;
  return (
    <button
      type="button"
      onClick={() => window.open(sec.register_url!, "_blank", "noopener,noreferrer")}
      className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      #{sec.section_id}
      <ExternalLink className="h-3 w-3" />
    </button>
  );
}

function Meetings({ sec }: { sec: CourseSection }) {
  const ms = meetingsOf(sec);
  if (!ms.length) return <p className="text-sm text-muted-foreground">No scheduled meeting times</p>;
  return (
    <>
      {ms.map((m, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
          {m.days && (
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium tracking-wide">{m.days}</span>
          )}
          {m.hours && <span>{m.hours}</span>}
          {m.location && <span className="text-muted-foreground">{m.location}</span>}
        </div>
      ))}
    </>
  );
}

/** A single-section course: the original "Taught by … / Meets" layout. */
function SingleSection({ sec }: { sec: CourseSection }) {
  const ins = sec.instructors.map(formatName).filter(Boolean);
  return (
    <section className="space-y-1.5">
      {ins.length > 0 && (
        <p className="text-sm">
          <span className="text-muted-foreground">Taught by </span>
          {ins.join(", ")}
        </p>
      )}
      <SectionLabel>{meetingsOf(sec).length ? "Meets" : "Schedule"}</SectionLabel>
      <Meetings sec={sec} />
    </section>
  );
}

/** Sections grouped by professor, each group collapsible (collapsed by default). */
function SectionsByProfessor({ sections }: { sections: CourseSection[] }) {
  const groups = new Map<string, CourseSection[]>();
  for (const sec of sections) {
    const prof = sec.instructors.map(formatName).filter(Boolean).join(", ") || "Instructor TBA";
    let arr = groups.get(prof);
    if (!arr) {
      arr = [];
      groups.set(prof, arr);
    }
    arr.push(sec);
  }
  const entries = Array.from(groups.entries()).sort((a, z) => a[0].localeCompare(z[0]));
  const [open, setOpen] = useState<Record<string, boolean>>({});

  return (
    <div className="space-y-2">
      {entries.map(([prof, secs]) => {
        const isOpen = open[prof] ?? false;
        return (
          <div key={prof} className="overflow-hidden rounded-lg border">
            <button
              type="button"
              onClick={() => setOpen((o) => ({ ...o, [prof]: !isOpen }))}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/50"
            >
              <span className="text-sm font-medium">{prof}</span>
              <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                {secs.length} section{secs.length > 1 ? "s" : ""}
                {isOpen ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
              </span>
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  key="content"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: "easeInOut" }}
                  className="overflow-hidden"
                >
                  <div className="divide-y border-t">
                    {secs.map((sec) => (
                      <div key={sec.section_id} className="flex items-center justify-between gap-2 px-3 py-2">
                        <div className="min-w-0 space-y-1">
                          <Meetings sec={sec} />
                        </div>
                        <RegisterLink sec={sec} />
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

function CourseDetail({ s }: { s: RetrievedSection }) {
  const code = courseCode(s.course_header);
  const name = titleCase(s.course_header.slice(code.length).trim());
  const meta = courseMeta(code);
  // The chip is one course; show every section here. Falls back to the section's own fields for
  // older messages whose annotation predates course_sections.
  const sections: CourseSection[] =
    s.course_sections && s.course_sections.length
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
  const multi = sections.length > 1;
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

      {(meta || s.instruction_mode || core.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {meta && (
            <>
              <Badge variant="secondary">
                {meta.credits} {meta.credits === 1 ? "credit" : "credits"}
              </Badge>
              <Badge variant="secondary">{meta.level}</Badge>
            </>
          )}
          {s.instruction_mode && <Badge variant="secondary">{s.instruction_mode}</Badge>}
          {core.map((c) => (
            <Badge key={c} variant="outline">{c}</Badge>
          ))}
        </div>
      )}

      {multi ? (
        <section className="space-y-2">
          <SectionLabel>{`${sections.length} sections`}</SectionLabel>
          <SectionsByProfessor sections={sections} />
        </section>
      ) : (
        <SingleSection sec={sections[0]!} />
      )}

      <CourseGrades aggregate={s.grade_data} semesters={s.semester_grades ?? []} />

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
                    <div className="flex shrink-0 items-center gap-1.5">
                      {ev.courseRating > 0 && (
                        <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium tracking-wide">
                          CES {ev.courseRating}/5
                        </span>
                      )}
                      {ev.instructorRating > 0 && (
                        <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium tracking-wide">
                          Prof {ev.instructorRating}/5
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <GradeBar grades={ig} />
              </div>
            );
          })}
        </section>
      )}

      {!multi && sections[0]?.register_url && (
        <Button
          className="w-full"
          onClick={() => window.open(sections[0]!.register_url!, "_blank", "noopener,noreferrer")}
        >
          View on UT Registration
        </Button>
      )}
    </div>
    </TooltipProvider>
  );
}

/** Unique professors teaching the course across all its sections (deduped, display-formatted). */
function courseProfessors(s: RetrievedSection): string[] {
  const sections = s.course_sections?.length
    ? s.course_sections
    : [{ instructors: s.instructors }];
  const set = new Set<string>();
  for (const sec of sections) {
    for (const inst of sec.instructors ?? []) {
      const name = formatName(inst);
      if (name) set.add(name);
    }
  }
  return Array.from(set);
}

export default function CourseChips({ annotations }: { annotations?: unknown[] }) {
  const sections = extractCourses(annotations);
  const [selected, setSelected] = useState<RetrievedSection | null>(null);
  if (!sections.length) return null;

  return (
    <>
      <div className="mt-3 flex flex-wrap gap-2 not-prose">
        {sections.map((s) => {
          const profs = courseProfessors(s);
          const label = profs.length === 1 ? profs[0] : profs.length > 1 ? `${profs.length} professors` : "";
          return (
            <button
              key={s.section_id}
              type="button"
              onClick={() => setSelected(s)}
              className="rounded-full border bg-background px-3 py-1 text-xs transition-colors hover:bg-muted"
            >
              <span className="font-medium">{courseCode(s.course_header)}</span>
              {label && <span className="text-muted-foreground"> {label}</span>}
            </button>
          );
        })}
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent>{selected && <CourseDetail s={selected} />}</DialogContent>
      </Dialog>
    </>
  );
}

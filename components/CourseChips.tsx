"use client";

import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import ProfessorRmpPanel, {
  type RmpPanelProf,
} from "@/components/ProfessorRmpPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import {
  ChevronDown,
  ChevronUp,
  ChevronRight,
  ExternalLink,
  Star,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  formatName,
  courseCode,
  titleCase,
  courseMeta,
  meetingsOf,
  toScheduleSection,
  GRADE_BUCKETS,
  computeGpa,
  type RetrievedSection,
  type CourseSection,
  type SemesterGrades,
  type ProfessorRating,
} from "@/lib/courses";
import AddToSchedule from "@/components/AddToSchedule";
import { useIsDesktop } from "@/components/hooks/use-is-desktop";

export type { RetrievedSection, CourseSection } from "@/lib/courses";

// Family colors, shaded darker→lighter across +/ /- so each grade reads distinctly in the bar.
const GRADE_COLOR: Record<string, string> = {
  "A+": "bg-emerald-600",
  A: "bg-emerald-500",
  "A-": "bg-emerald-400",
  "B+": "bg-lime-600",
  B: "bg-lime-500",
  "B-": "bg-lime-400",
  "C+": "bg-yellow-600",
  C: "bg-yellow-500",
  "C-": "bg-yellow-400",
  "D+": "bg-orange-600",
  D: "bg-orange-500",
  "D-": "bg-orange-400",
  F: "bg-red-500",
  Other: "bg-muted-foreground/40",
};
// Breakdown grid: one row per letter family (empty families are skipped).
const FAMILY_ROWS: string[][] = [
  ["A+", "A", "A-"],
  ["B+", "B", "B-"],
  ["C+", "C", "C-"],
  ["D+", "D", "D-"],
  ["F", "Other"],
];

/** Pull the course sections out of a message's annotations (written by the Worker). */
export function extractCourses(annotations?: unknown[]): RetrievedSection[] {
  const a = (annotations ?? []).find(
    (x): x is { type: string; sections: RetrievedSection[] } =>
      !!x &&
      typeof x === "object" &&
      (x as { type?: string }).type === "courses",
  );
  return a?.sections ?? [];
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
}

export function GradeBar({
  grades,
}: {
  grades: Record<string, number> | null;
}) {
  const total = grades
    ? GRADE_BUCKETS.reduce((n, b) => n + (grades[b] ?? 0), 0)
    : 0;
  if (!grades || !total)
    return <span className="text-xs text-muted-foreground">No grade data</span>;

  const gpa = computeGpa(grades);
  const seg = GRADE_BUCKETS.map((b) => {
    const count = grades[b] ?? 0;
    return {
      b,
      count,
      width: (count / total) * 100,
      pct: Math.round((count / total) * 100),
    };
  });

  return (
    <div className="space-y-2">
      {gpa != null && (
        <div className="flex items-baseline gap-1.5">
          <span className="text-lg font-bold tabular-nums text-foreground">
            {gpa.toFixed(2)}
          </span>
          <span className="text-xs text-muted-foreground">
            avg GPA - {total.toLocaleString()} grades
          </span>
        </div>
      )}
      <div className="flex h-2.5 w-full overflow-hidden rounded-full">
        {seg
          .filter((p) => p.width > 0)
          .map((p) => (
            <Tooltip key={p.b}>
              <TooltipTrigger asChild>
                <motion.div
                  className={GRADE_COLOR[p.b] ?? "bg-muted"}
                  initial={false}
                  animate={{ width: `${p.width}%` }}
                  transition={{ duration: 0.35, ease: "easeInOut" }}
                />
              </TooltipTrigger>
              <TooltipContent>
                {p.count.toLocaleString()}{" "}
                {p.count === 1 ? "student" : "students"} - {p.b}
              </TooltipContent>
            </Tooltip>
          ))}
      </div>
      <div className="space-y-0.5">
        {FAMILY_ROWS.map((row, i) => {
          const cells = row
            .map((b) => seg.find((s) => s.b === b))
            .filter((s): s is (typeof seg)[number] => !!s && s.count > 0);
          if (!cells.length) return null;
          return (
            <div
              key={i}
              className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground"
            >
              {cells.map((p) => (
                <span key={p.b} className="tabular-nums">
                  <span className="font-semibold text-foreground">{p.b}</span>{" "}
                  {p.pct}%
                </span>
              ))}
            </div>
          );
        })}
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
    for (const b of GRADE_BUCKETS)
      total[b] = (total[b] ?? 0) + (grades?.[b] ?? 0);
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
  const sorted = [...semesters].sort(
    (a, z) => semesterValue(z.semester) - semesterValue(a.semester),
  );
  const hasSemesters = sorted.length > 0;
  const [selected, setSelected] = useState(AGGREGATE);

  const aggGrades = hasSemesters ? sumGrades(sorted) : aggregate;
  const grades =
    selected === AGGREGATE
      ? aggGrades
      : (sorted.find((s) => s.semester === selected)?.grades ?? null);

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
              <DropdownMenuRadioGroup
                value={selected}
                onValueChange={setSelected}
              >
                <DropdownMenuRadioItem value={AGGREGATE} className="text-xs">
                  Aggregate
                </DropdownMenuRadioItem>
                {sorted.map((s) => (
                  <DropdownMenuRadioItem
                    key={s.semester}
                    value={s.semester}
                    className="text-xs"
                  >
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

function RegisterLink({ sec }: { sec: CourseSection }) {
  if (!sec.register_url)
    return (
      <span className="text-xs tabular-nums text-muted-foreground">
        #{sec.section_id}
      </span>
    );
  return (
    <button
      type="button"
      onClick={() =>
        window.open(sec.register_url!, "_blank", "noopener,noreferrer")
      }
      className="inline-flex shrink-0 items-center gap-1 text-xs tabular-nums text-muted-foreground transition-colors hover:text-foreground"
    >
      #{sec.section_id}
      <ExternalLink className="h-3 w-3" />
    </button>
  );
}

function Meetings({ sec }: { sec: CourseSection }) {
  const ms = meetingsOf(sec);
  if (!ms.length)
    return (
      <p className="text-sm text-muted-foreground">
        No scheduled meeting times
      </p>
    );
  return (
    <>
      {ms.map((m, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
          {m.days && (
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium tracking-wide">
              {m.days}
            </span>
          )}
          {m.hours && <span>{m.hours}</span>}
          {m.location && (
            <span className="text-muted-foreground">{m.location}</span>
          )}
        </div>
      ))}
    </>
  );
}

/** A single-section course: the original "Taught by … / Meets" layout. */
function SingleSection({
  sec,
  s,
}: {
  sec: CourseSection;
  s: RetrievedSection;
}) {
  const ins = sec.instructors.map(formatName).filter(Boolean);
  return (
    <section className="space-y-1.5">
      {ins.length > 0 && (
        <p className="text-sm">
          <span className="text-muted-foreground">Taught by </span>
          {ins.join(", ")}
        </p>
      )}
      <SectionLabel>
        {meetingsOf(sec).length ? "Meets" : "Schedule"}
      </SectionLabel>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <Meetings sec={sec} />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <AddToSchedule section={toScheduleSection(s, sec)} />
          <RegisterLink sec={sec} />
        </div>
      </div>
    </section>
  );
}

/** Sections grouped by professor, each group collapsible (collapsed by default). */
function SectionsByProfessor({
  sections,
  s,
}: {
  sections: CourseSection[];
  s: RetrievedSection;
}) {
  const groups = new Map<string, CourseSection[]>();
  for (const sec of sections) {
    const prof =
      sec.instructors.map(formatName).filter(Boolean).join(", ") ||
      "Instructor TBA";
    let arr = groups.get(prof);
    if (!arr) {
      arr = [];
      groups.set(prof, arr);
    }
    arr.push(sec);
  }
  const entries = Array.from(groups.entries()).sort((a, z) =>
    a[0].localeCompare(z[0]),
  );
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
                {isOpen ? (
                  <ChevronUp className="h-4 w-4 shrink-0" />
                ) : (
                  <ChevronDown className="h-4 w-4 shrink-0" />
                )}
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
                      <div
                        key={sec.section_id}
                        className="flex items-center justify-between gap-2 px-3 py-2"
                      >
                        <div className="min-w-0 space-y-1">
                          <Meetings sec={sec} />
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <AddToSchedule section={toScheduleSection(s, sec)} />
                          <RegisterLink sec={sec} />
                        </div>
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

function RmpRow({
  rmp,
  onDetails,
}: {
  rmp: ProfessorRating;
  onDetails: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onDetails}
      className="block w-full rounded-lg bg-muted/40 p-3 text-left transition-colors hover:bg-muted"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium">RateMyProfessors</span>
        <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
          Details
          <ChevronRight className="h-3.5 w-3.5" />
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
        {rmp.rmpRating != null && (
          <span className="inline-flex items-center gap-1">
            <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
            <span className="font-semibold text-foreground">
              {rmp.rmpRating.toFixed(1)}
            </span>
            <span className="text-xs text-muted-foreground">/5</span>
          </span>
        )}
        {rmp.rmpNumRatings != null && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
            {rmp.rmpNumRatings} ratings
          </span>
        )}
        {rmp.rmpCourse && (
          <>
            <span className="h-4 w-px shrink-0 bg-border" aria-hidden />
            <span className="text-xs font-medium">In {rmp.rmpCourse.code}</span>
            <span className="inline-flex items-center gap-1">
              <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
              <span className="font-semibold text-foreground">
                {rmp.rmpCourse.rating.toFixed(1)}
              </span>
              <span className="text-xs text-muted-foreground">/5</span>
            </span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {rmp.rmpCourse.numRatings}{" "}
              {rmp.rmpCourse.numRatings === 1 ? "rating" : "ratings"}
            </span>
          </>
        )}
      </div>
    </button>
  );
}

// Course description: lead paragraph shown, the rest behind a "View more" toggle.
function CourseDescription({ text }: { text: string }) {
  const paras = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? paras : paras.slice(0, 1);
  return (
    <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
      {shown.map((p, i) => (
        <p key={i} className="whitespace-pre-line">
          {p}
        </p>
      ))}
      {paras.length > 1 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="cursor-pointer text-xs font-medium text-texas hover:underline"
        >
          {expanded ? "View less" : "View more"}
        </button>
      )}
    </div>
  );
}

function CourseDetail({
  s,
  onOpenRmp,
}: {
  s: RetrievedSection;
  onOpenRmp: (prof: RmpPanelProf) => void;
}) {
  const code = courseCode(s.course_header);
  const name = titleCase(s.course_header.slice(code.length).trim());
  const meta = courseMeta(code);

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
  const evalByInstructor = new Map(
    (s.evaluations ?? []).map((e) => [e.instructor, e]),
  );
  const rmpByInstructor = new Map(
    (s.professor_ratings ?? []).map((p) => [p.instructor, p]),
  );
  const gradesByInstructor = new Map(
    (s.instructor_grades ?? []).map((ig) => [ig.instructor, ig]),
  );

  const profNames: string[] = [];
  for (const ig of s.instructor_grades ?? [])
    if (!profNames.includes(ig.instructor)) profNames.push(ig.instructor);
  for (const p of s.professor_ratings ?? [])
    if (!profNames.includes(p.instructor)) profNames.push(p.instructor);

  return (
    <TooltipProvider delayDuration={100}>
      <div className="space-y-5">
        <DialogHeader className="space-y-1 text-left">
          {name && (
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {code}
            </p>
          )}
          <DialogTitle className="pr-6 text-xl leading-tight">
            {name || code}
          </DialogTitle>
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
            {s.instruction_mode && (
              <Badge variant="secondary">{s.instruction_mode}</Badge>
            )}
            {core.map((c) => (
              <Badge key={c} variant="outline">
                {c}
              </Badge>
            ))}
          </div>
        )}

        {s.description && <CourseDescription text={s.description} />}

        {multi ? (
          <section className="space-y-2">
            <SectionLabel>{`${sections.length} sections`}</SectionLabel>
            <SectionsByProfessor sections={sections} s={s} />
          </section>
        ) : (
          <SingleSection sec={sections[0]!} s={s} />
        )}

        <CourseGrades
          aggregate={s.grade_data}
          semesters={s.semester_grades ?? []}
        />

        {profNames.length > 0 && (
          <section className="space-y-2">
            <SectionLabel>By professor</SectionLabel>
            {profNames.map((name) => {
              const grades = gradesByInstructor.get(name) ?? null;
              const ev = evalByInstructor.get(name);
              const rmp = rmpByInstructor.get(name);
              return (
                <div key={name} className="space-y-2 rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium">
                      {formatName(name)}
                    </span>
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
                  {grades ? (
                    <GradeBar grades={grades} />
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      No grade data
                    </span>
                  )}
                  {rmp && (rmp.rmpNumRatings ?? 0) > 0 && (
                    <RmpRow
                      rmp={rmp}
                      onDetails={() =>
                        onOpenRmp({
                          legacyId: rmp.rmpLegacyId,
                          name: formatName(name),
                          department: rmp.rmpDepartment,
                        })
                      }
                    />
                  )}
                </div>
              );
            })}
          </section>
        )}

        {!multi && sections[0]?.register_url && (
          <Button
            className="w-full bg-texas text-white hover:bg-texas/90"
            onClick={() =>
              window.open(
                sections[0]!.register_url!,
                "_blank",
                "noopener,noreferrer",
              )
            }
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

function CourseDetailSkeleton() {
  return (
    <div className="space-y-5">
      <DialogTitle className="sr-only">Loading course</DialogTitle>
      <div className="space-y-1.5">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-6 w-2/3" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-24 rounded-full" />
      </div>
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-24 w-full rounded-lg" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

export function CourseDialog({
  section,
  loading = false,
  onClose,
}: {
  section: RetrievedSection | null;
  loading?: boolean;
  onClose: () => void;
}) {
  const [rmpProf, setRmpProf] = useState<RmpPanelProf | null>(null);
  const isDesktop = useIsDesktop();

  return (
    <Dialog
      open={!!section || loading}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
          setRmpProf(null);
        }
      }}
    >
      <DialogPortal>
        <DialogOverlay />
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="relative flex items-start gap-3 outline-none ring-0 duration-200 focus:outline-none focus-visible:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          >
            {/* Course card */}
            <div className="relative w-[32rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border bg-background shadow-lg">
              <div className="max-h-[85vh] overflow-y-auto p-6">
                {section ? (
                  <CourseDetail
                    s={section}
                    onOpenRmp={(prof) =>
                      setRmpProf((cur) =>
                        cur?.legacyId === prof.legacyId ? null : prof,
                      )
                    }
                  />
                ) : loading ? (
                  <CourseDetailSkeleton />
                ) : null}
              </div>
              <DialogPrimitive.Close className="absolute right-4 top-4 z-10 cursor-pointer rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </DialogPrimitive.Close>
            </div>

            {/* Desktop: RMP detail slides out beside the card */}
            <AnimatePresence>
              {isDesktop && rmpProf && (
                <motion.aside
                  key="rmp-panel"
                  initial={{ opacity: 0, width: 0, x: -12 }}
                  animate={{ opacity: 1, width: 340, x: 0 }}
                  exit={{ opacity: 0, width: 0, x: -12 }}
                  transition={{ duration: 0.28, ease: "easeInOut" }}
                  className="overflow-hidden"
                >
                  <div className="w-[340px] overflow-hidden rounded-lg border bg-background shadow-lg">
                    <ProfessorRmpPanel
                      prof={rmpProf}
                      onClose={() => setRmpProf(null)}
                    />
                  </div>
                </motion.aside>
              )}
            </AnimatePresence>

            {/* Mobile: RMP can't sit beside the card, so it opens as its own overlay */}
            {!isDesktop && rmpProf && (
              <div
                className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
                onClick={() => setRmpProf(null)}
              >
                <div
                  className="w-full max-w-md overflow-hidden rounded-lg border bg-background shadow-lg"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ProfessorRmpPanel
                    prof={rmpProf}
                    onClose={() => setRmpProf(null)}
                  />
                </div>
              </div>
            )}
          </DialogPrimitive.Content>
        </div>
      </DialogPortal>
    </Dialog>
  );
}

export default function CourseChips({
  annotations,
}: {
  annotations?: unknown[];
}) {
  const sections = extractCourses(annotations);
  const [selected, setSelected] = useState<RetrievedSection | null>(null);
  if (!sections.length) return null;

  return (
    <>
      <div className="mt-3 flex flex-wrap gap-2 not-prose">
        {sections.map((s) => {
          const profs = courseProfessors(s);
          const label =
            profs.length === 1
              ? profs[0]
              : profs.length > 1
                ? `${profs.length} professors`
                : "";
          return (
            <button
              key={s.section_id}
              type="button"
              onClick={() => setSelected(s)}
              className="cursor-pointer rounded-full border bg-background px-3 py-1 text-xs transition-colors hover:border-texas/60 hover:text-texas"
            >
              <span className="font-medium">{courseCode(s.course_header)}</span>
              {label && <span className="text-muted-foreground"> {label}</span>}
            </button>
          );
        })}
      </div>

      <CourseDialog section={selected} onClose={() => setSelected(null)} />
    </>
  );
}

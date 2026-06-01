"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Plus,
  X,
  Loader2,
  Sparkles,
  ChevronDown,
  CalendarDays,
  SlidersHorizontal,
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  Bookmark,
  Trash2,
  MoreHorizontal,
  Info,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { useToast } from "@/components/hooks/use-toast";
import { useSchedules } from "@/lib/schedules";
import {
  fetchBrowseCourses,
  fetchCourseDetail,
  type BrowseCourse,
} from "@/lib/browse";
import {
  courseCode,
  titleCase,
  colorAt,
  parseDays,
  parseHourRange,
  minuteLabel,
  toScheduleSection,
  lastName,
  scheduleSectionToRetrieved,
  type RetrievedSection,
  type ScheduleSection,
  type CourseColor,
} from "@/lib/courses";
import {
  generateSchedules,
  type GeneratedSchedule,
  type SchedulerPrefs,
  type SchedulerResult,
  type RankMode,
} from "@/lib/scheduler";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Slider } from "@/components/ui/slider";
import { CourseDialog } from "@/components/CourseChips";
import { cn } from "@/lib/utils";

type Desired = {
  course: BrowseCourse;
  detail: RetrievedSection | null;
  loading: boolean;
  error: boolean;
};

// 0=Mon … 6=Sun (matches parseDays). Weekend columns only render when a class actually falls there.
const DAY_LABELS = ["M", "T", "W", "Th", "F", "Sa", "Su"];
const GRID_START = 8 * 60; // 8 AM
const GRID_END = 21 * 60; // 9 PM
// Hour ticks for the mini-grid time axis: 9, 12, 3, 6 (24h: 9/12/15/18).
const MINI_MARKS = [9, 12, 15, 18];
const shortHour = (h: number) => `${h % 12 || 12}`;

// Days to render: always Mon–Fri, extended through the latest weekday any class meets.
const visibleDays = (...dayLists: number[][]): number[] => {
  const last = Math.max(4, ...dayLists.flat());
  return Array.from({ length: last + 1 }, (_, i) => i);
};
const gridCols = (n: number) => `repeat(${n}, minmax(0, 1fr))`;

const PAGE_SIZE = 8; // generated schedules shown per page (engine keeps up to 60)

type Opt<T> = { label: string; value: T };

const EARLIEST_OPTS: Opt<number | null>[] = [
  { label: "Any time", value: null },
  { label: "8 AM", value: 8 * 60 },
  { label: "9 AM", value: 9 * 60 },
  { label: "10 AM", value: 10 * 60 },
  { label: "11 AM", value: 11 * 60 },
  { label: "Noon", value: 12 * 60 },
];
const LATEST_OPTS: Opt<number | null>[] = [
  { label: "Any time", value: null },
  { label: "Noon", value: 12 * 60 },
  { label: "2 PM", value: 14 * 60 },
  { label: "3 PM", value: 15 * 60 },
  { label: "5 PM", value: 17 * 60 },
  { label: "7 PM", value: 19 * 60 },
  { label: "9 PM", value: 21 * 60 },
];
// "Sort by" picks the dimension; the direction toggle picks order using labels that fit the dimension (gaps reads "Fewest/Most", professors "Best/Worst") — never an ambiguous "best/worst".
type SortCat = {
  id: string;
  label: string;
  rank: RankMode;
  descLabel: string;
  ascLabel: string;
};
const SORT_CATS: SortCat[] = [
  { id: "best", label: "Professor Rating", rank: "best", descLabel: "Best first", ascLabel: "Worst first" },
  { id: "easiest", label: "A's", rank: "easiest", descLabel: "Most A's", ascLabel: "Fewest A's" },
  { id: "daysoff", label: "Days Off", rank: "daysoff", descLabel: "Most Days Off", ascLabel: "Fewest Days Off" },
  { id: "compact", label: "Gaps", rank: "compact", descLabel: "Fewest Gaps", ascLabel: "Most Gaps" },
  { id: "earliest", label: "Start Time", rank: "earliest", descLabel: "Latest", ascLabel: "Earliest" },
];
const SORT_CAT_OPTS: Opt<string>[] = SORT_CATS.map((c) => ({
  value: c.id,
  label: c.label,
}));

// Full-range slider defaults = filter off. Narrowing either end turns the filter on.
const GAP_RANGE: [number, number] = [0, 96]; // hours of weekly gaps
const RATING_RANGE: [number, number] = [0, 5]; // avg professor rating

// Saved course sets, persisted per-browser in localStorage (no backend / migration needed).
type Preset = { id: string; name: string; courses: BrowseCourse[] };
const PRESETS_KEY = "utrgpt:build-presets";
const readPresets = (): Preset[] => {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PRESETS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};
const writePresets = (presets: Preset[]) => {
  try {
    window.localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  } catch {
    /* storage disabled or full — presets just won't persist */
  }
};

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        active ? "border-texas/40 bg-texas/10 text-texas" : "hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

// A compact labeled single-select (styled like the "Add to" trigger) — scales to many options without the pill-row clutter.
function SelectMenu<T extends string | number | null>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Opt<T>[];
  onChange: (v: T) => void;
}) {
  const current = options.find((o) => o.value === value) ?? options[0];
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <DropdownMenu>
        <DropdownMenuTrigger className="flex w-full items-center justify-between gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted">
          <span className="truncate">{current?.label}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-60 overflow-y-auto">
          {options.map((o) => (
            <DropdownMenuItem
              key={String(o.value)}
              onClick={() => onChange(o.value)}
              className={cn(
                "text-xs",
                o.value === value && "bg-muted font-medium",
              )}
            >
              {o.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// A two-ended range slider with a live min–max readout, used for the gap-hours and rating filters.
function RangeField({
  label,
  hint,
  value,
  onChange,
  min,
  max,
  step,
  format,
}: {
  label: string;
  hint?: string;
  value: [number, number];
  onChange: (v: [number, number]) => void;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}) {
  // Track the value locally while dragging (live readout) and commit only on release, so we don't re-generate the schedules on every intermediate tick.
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
        <span className="text-xs font-medium tabular-nums">
          {format(draft[0])} – {format(draft[1])}
        </span>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={draft}
        onValueChange={(v) => setDraft([v[0]!, v[1]!])}
        onValueCommit={(v) => onChange([v[0]!, v[1]!])}
      />
      {hint && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

// Read-only Mon–Fri preview of one generated schedule (8 AM–9 PM compressed). `fixed` classes (the target schedule's existing courses) render dimmed behind the new, colored picks.
function MiniGrid({
  sched,
  fixed = [],
}: {
  sched: GeneratedSchedule;
  fixed?: ScheduleSection[];
}) {
  const span = GRID_END - GRID_START;
  const pct = (startMin: number, endMin: number) => ({
    top: Math.max(0, ((startMin - GRID_START) / span) * 100),
    height: Math.min(100, Math.max(4, ((endMin - startMin) / span) * 100)),
  });
  const markPct = (h: number) => ((h * 60 - GRID_START) / span) * 100;

  const cells: {
    day: number;
    top: number;
    height: number;
    code: string;
    idx: number;
    startMin: number;
    endMin: number;
  }[] = [];
  let online = 0;
  sched.picks.forEach((p, idx) => {
    const code = courseCode(p.course.course_header).replace(/\s+/g, "");
    const days = p.section.schedule_days ?? [];
    const hours = p.section.schedule_hours ?? [];
    let placed = false;
    for (let i = 0; i < days.length; i++) {
      const dd = parseDays(days[i] ?? "");
      const r = parseHourRange(hours[i] ?? "");
      if (!r || !dd.length) continue;
      placed = true;
      for (const d of dd)
        cells.push({
          day: d,
          ...pct(r.startMin, r.endMin),
          code,
          idx,
          startMin: r.startMin,
          endMin: r.endMin,
        });
    }
    if (!placed) online++;
  });

  const fixedCells: {
    day: number;
    top: number;
    height: number;
    code: string;
    startMin: number;
    endMin: number;
  }[] = [];
  for (const s of fixed)
    for (const m of s.meetings) {
      const dd = parseDays(m.days);
      const r = parseHourRange(m.hours);
      if (!r || !dd.length) continue;
      for (const d of dd)
        fixedCells.push({
          day: d,
          ...pct(r.startMin, r.endMin),
          code: s.course_code.replace(/\s+/g, ""),
          startMin: r.startMin,
          endMin: r.endMin,
        });
    }

  const cols = visibleDays(
    cells.map((c) => c.day),
    fixedCells.map((c) => c.day),
  );

  return (
    <div>
      {/* Time gutter is the first cell of the SAME grid row as the day cells, so labels and the per-cell hour lines share one height/top — they line up with no cross-container offset. */}
      <div
        className="grid h-28 gap-0.5"
        style={{ gridTemplateColumns: `1.25rem ${gridCols(cols.length)}` }}
      >
        <div className="relative">
          {MINI_MARKS.map((h) => (
            <span
              key={h}
              className="absolute right-1 text-[7px] leading-none text-muted-foreground/70"
              style={{
                top: `${markPct(h)}%`,
                // center on the mark, plus a hair down to offset the font's high-sitting glyphs
                transform: "translateY(calc(-50% + 0.5px))",
              }}
            >
              {shortHour(h)}
            </span>
          ))}
        </div>
        {cols.map((d) => (
          <div key={d} className="relative overflow-hidden rounded bg-muted/40">
            {MINI_MARKS.map((h) => (
              <div
                key={h}
                className="pointer-events-none absolute inset-x-0 h-px -translate-y-1/2 bg-border/50"
                style={{ top: `${markPct(h)}%` }}
              />
            ))}
            {fixedCells
              .filter((c) => c.day === d)
              .map((c, i) => (
                <div
                  key={`f${i}`}
                  title={`${c.code} · ${minuteLabel(c.startMin)}–${minuteLabel(c.endMin)}`}
                  className="absolute inset-x-0.5 flex items-center justify-center overflow-hidden rounded-sm border border-dashed border-muted-foreground/40 bg-muted px-0.5 text-[8px] font-medium leading-none text-muted-foreground"
                  style={{ top: `${c.top}%`, height: `${c.height}%` }}
                >
                  <span className="truncate">{c.code}</span>
                </div>
              ))}
            {cells
              .filter((c) => c.day === d)
              .map((c, i) => {
                const col = colorAt(c.idx);
                return (
                  <div
                    key={i}
                    title={`${c.code} · ${minuteLabel(c.startMin)}–${minuteLabel(c.endMin)}`}
                    className={cn(
                      "absolute inset-x-0.5 flex items-center justify-center overflow-hidden rounded-sm px-0.5 text-[8px] font-semibold leading-none",
                      col.bg,
                      col.text,
                    )}
                    style={{ top: `${c.top}%`, height: `${c.height}%` }}
                  >
                    <span className="truncate">{c.code}</span>
                  </div>
                );
              })}
          </div>
        ))}
      </div>
      <div
        className="mt-1 grid gap-0.5 text-center text-[9px] text-muted-foreground"
        style={{ gridTemplateColumns: `1.25rem ${gridCols(cols.length)}` }}
      >
        <div />
        {cols.map((d) => (
          <div key={d}>{DAY_LABELS[d]}</div>
        ))}
      </div>
      {online > 0 && (
        <p className="mt-1 text-[10px] text-muted-foreground">
          +{online} online/async
        </p>
      )}
    </div>
  );
}

// Full read-only weekly calendar for the preview dialog: real time gutter + hour lines, auto-fit to the schedule's actual hours, Mon–Fri by default extending into the weekend only if a class meets then. New picks are colored; the target's existing classes are dimmed/dashed. Generated schedules are conflict-free, so blocks never overlap (no lane logic).
const PREVIEW_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOUR_PX = 52;

function PreviewGrid({
  sched,
  fixed = [],
  onSelectCourse,
}: {
  sched: GeneratedSchedule;
  fixed?: ScheduleSection[];
  onSelectCourse: (course: RetrievedSection) => void;
}) {
  type Blk = {
    day: number;
    startMin: number;
    endMin: number;
    code: string;
    location: string;
    prof: string;
    course: RetrievedSection | null;
    color?: CourseColor;
    fixed: boolean;
  };
  const blocks: Blk[] = [];
  const online: string[] = [];

  sched.picks.forEach((p, idx) => {
    const code = courseCode(p.course.course_header).replace(/\s+/g, "");
    const days = p.section.schedule_days ?? [];
    const hours = p.section.schedule_hours ?? [];
    const locs = p.section.schedule_location ?? [];
    let placed = false;
    for (let i = 0; i < days.length; i++) {
      const dd = parseDays(days[i] ?? "");
      const r = parseHourRange(hours[i] ?? "");
      if (!r || !dd.length) continue;
      placed = true;
      for (const d of dd)
        blocks.push({
          day: d,
          startMin: r.startMin,
          endMin: r.endMin,
          code,
          location: (locs[i] ?? "").trim(),
          prof: p.section.instructors?.[0]
            ? lastName(p.section.instructors[0])
            : "",
          course: p.course,
          color: colorAt(idx),
          fixed: false,
        });
    }
    if (!placed) online.push(code);
  });

  for (const s of fixed)
    for (const m of s.meetings) {
      const dd = parseDays(m.days);
      const r = parseHourRange(m.hours);
      if (!r || !dd.length) continue;
      for (const d of dd)
        blocks.push({
          day: d,
          startMin: r.startMin,
          endMin: r.endMin,
          code: s.course_code.replace(/\s+/g, ""),
          location: m.location.trim(),
          prof: s.instructors?.[0] ? lastName(s.instructors[0]) : "",
          course: s.detail ?? scheduleSectionToRetrieved(s),
          fixed: true,
        });
    }

  const cols = visibleDays(blocks.map((b) => b.day));

  const minH = blocks.length
    ? Math.floor(Math.min(...blocks.map((b) => b.startMin)) / 60)
    : 8;
  const maxH = blocks.length
    ? Math.ceil(Math.max(...blocks.map((b) => b.endMin)) / 60)
    : 18;
  const top0 = minH * 60;
  const totalHeight = (maxH - minH) * HOUR_PX;
  const hours = Array.from({ length: maxH - minH + 1 }, (_, i) => minH + i);

  return (
    <div>
      <div className="flex">
        <div className="w-14 shrink-0" />
        {cols.map((d) => (
          <div
            key={d}
            className="flex-1 pb-1.5 text-center text-xs font-medium text-muted-foreground"
          >
            {PREVIEW_DAYS[d]}
          </div>
        ))}
      </div>
      <div className="flex" style={{ height: totalHeight }}>
        <div className="relative w-14 shrink-0">
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
        <div
          className="grid flex-1"
          style={{ gridTemplateColumns: gridCols(cols.length) }}
        >
          {cols.map((d) => (
            <div
              key={d}
              className="relative border-l"
              style={{ height: totalHeight }}
            >
              {hours.map((h, i) => (
                <div
                  key={h}
                  className="pointer-events-none absolute inset-x-0 border-t border-border/40"
                  style={{ top: i * HOUR_PX }}
                />
              ))}
              {blocks
                .filter((b) => b.day === d)
                .map((b, i) => (
                  <div
                    key={i}
                    role={b.course ? "button" : undefined}
                    tabIndex={b.course ? 0 : undefined}
                    onClick={() => b.course && onSelectCourse(b.course)}
                    onKeyDown={(e) => {
                      if (b.course && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        onSelectCourse(b.course);
                      }
                    }}
                    className={cn(
                      "absolute inset-x-0.5 overflow-hidden rounded-md px-1.5 py-1 text-[11px] leading-tight outline-none focus-visible:ring-2 focus-visible:ring-texas/40",
                      b.course && "cursor-pointer",
                      b.fixed
                        ? "border border-dashed border-muted-foreground/40 bg-muted text-muted-foreground"
                        : cn(b.color?.bg, b.color?.text),
                    )}
                    style={{
                      top: ((b.startMin - top0) / 60) * HOUR_PX + 1,
                      height: Math.max(
                        ((b.endMin - b.startMin) / 60) * HOUR_PX - 2,
                        18,
                      ),
                    }}
                  >
                    <div className="truncate font-semibold">
                      {b.code}
                      {b.prof ? ` - ${b.prof}` : ""}
                    </div>
                    <div className="truncate opacity-80">
                      {minuteLabel(b.startMin)}–{minuteLabel(b.endMin)}
                    </div>
                    {b.location && (
                      <div className="truncate opacity-60">{b.location}</div>
                    )}
                  </div>
                ))}
            </div>
          ))}
        </div>
      </div>
      {online.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          No set meeting time: {online.join(", ")}
        </p>
      )}
    </div>
  );
}

function ResultCard({
  sched,
  fixed,
  applying,
  onApply,
  onPreview,
}: {
  sched: GeneratedSchedule;
  fixed: ScheduleSection[];
  applying: boolean;
  onApply: () => void;
  onPreview: () => void;
}) {
  const gaps =
    sched.gapMinutes >= 60
      ? `${(sched.gapMinutes / 60).toFixed(1).replace(/\.0$/, "")}h/week`
      : `${sched.gapMinutes}m/week`;
  const off = sched.daysOff.length
    ? sched.daysOff.map((d) => DAY_LABELS[d]).join(" ")
    : "None";
  const more: { k: string; v: string; info?: string }[] = [
    {
      k: "Avg A-rate",
      v: Number.isFinite(sched.ease)
        ? `${Math.round(sched.ease * 100)}%`
        : "N/A",
      info: "Average share of A grades these professors gave in past semesters. Higher means more lenient grading.",
    },
    {
      k: "Earliest class",
      v: sched.earliestStart != null ? minuteLabel(sched.earliestStart) : "None",
    },
    {
      k: "Latest class",
      v: sched.latestEnd != null ? minuteLabel(sched.latestEnd) : "None",
    },
    { k: "Classes", v: String(sched.picks.length) },
  ];
  return (
    <div className="rounded-lg border bg-background p-3">
      <MiniGrid sched={sched} fixed={fixed} />
      <div className="mt-2 flex flex-nowrap items-center gap-1 text-[11px] text-muted-foreground">
        <span className="whitespace-nowrap rounded-full border px-1.5 py-0.5">
          <span className="font-semibold">Prof:</span>{" "}
          {(sched.quality * 5).toFixed(1)}/5
        </span>
        <span className="whitespace-nowrap rounded-full border px-1.5 py-0.5">
          <span className="font-semibold">Off:</span> {off}
        </span>
        <span className="whitespace-nowrap rounded-full border px-1.5 py-0.5">
          <span className="font-semibold">Gap:</span> {gaps}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger
            title="More details"
            className="inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 transition-colors hover:bg-muted"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <div className="space-y-1.5 px-2 py-1.5 text-[11px]">
              {more.map(({ k, v, info }) => (
                <div
                  key={k}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="flex items-center gap-1 text-muted-foreground">
                    {k}
                    {info && (
                      <span title={info} className="cursor-help">
                        <Info className="h-3 w-3 opacity-70" />
                      </span>
                    )}
                  </span>
                  <span className="font-medium">{v}</span>
                </div>
              ))}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="mt-2 flex gap-2">
        <Button size="sm" variant="secondary" onClick={onPreview}>
          <CalendarDays className="mr-1.5 h-4 w-4" />
          Preview
        </Button>
        <Button
          size="sm"
          className="flex-1 bg-texas text-white hover:bg-texas/90"
          onClick={onApply}
          disabled={applying}
        >
          {applying ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "Use this schedule"
          )}
        </Button>
      </div>
    </div>
  );
}

export default function BuildView() {
  const router = useRouter();
  const { toast } = useToast();
  const { schedules, createSchedule, addSection, setActiveId } = useSchedules();
  const [supabase] = useState(() => createClient());

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BrowseCourse[]>([]);
  const [searching, setSearching] = useState(false);
  const reqId = useRef(0);

  // The results list is position:fixed (anchored to the input via its rect) so it floats over the page without resizing it — and fixed escapes the scroll container's overflow clipping.
  const inputWrapRef = useRef<HTMLDivElement>(null);
  const [menuRect, setMenuRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const updateMenuRect = useCallback(() => {
    const el = inputWrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setMenuRect({ top: r.bottom + 4, left: r.left, width: r.width });
  }, []);

  // Recompute while the list is open; reposition on scroll/resize (no polling — listeners only).
  useEffect(() => {
    if (!results.length) {
      setMenuRect(null);
      return;
    }
    updateMenuRect();
    window.addEventListener("scroll", updateMenuRect, true);
    window.addEventListener("resize", updateMenuRect);
    return () => {
      window.removeEventListener("scroll", updateMenuRect, true);
      window.removeEventListener("resize", updateMenuRect);
    };
  }, [results, updateMenuRect]);

  const [desired, setDesired] = useState<Desired[]>([]);
  const [targetId, setTargetId] = useState<string | null>(null); // null = create a new schedule
  const [sortCat, setSortCat] = useState("best");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const sortCatObj = SORT_CATS.find((c) => c.id === sortCat) ?? SORT_CATS[0]!;
  const [filterOpen, setFilterOpen] = useState(false);
  const [earliest, setEarliest] = useState<number | null>(null);
  const [latest, setLatest] = useState<number | null>(null);
  const [daysOff, setDaysOff] = useState<number[]>([]);
  const [gapRange, setGapRange] = useState<[number, number]>(GAP_RANGE);
  const [ratingRange, setRatingRange] = useState<[number, number]>(RATING_RANGE);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [savePresetOpen, setSavePresetOpen] = useState(false);
  const [presetName, setPresetName] = useState("");

  const [generated, setGenerated] = useState<SchedulerResult | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  // Flips true on the first explicit Generate; gates the live re-generate effect so filter changes don't auto-run before the user has asked for results once.
  const generatedOnce = useRef(false);
  const [applyingIdx, setApplyingIdx] = useState<number | null>(null);
  const [preview, setPreview] = useState<{
    sched: GeneratedSchedule;
    idx: number;
  } | null>(null);
  const [selectedCourse, setSelectedCourse] = useState<RetrievedSection | null>(
    null,
  );

  // The schedule to build into. An existing target's classes + time blocks become fixed constraints.
  const target = schedules.find((s) => s.id === targetId) ?? null;
  const fixedSections = target?.sections ?? [];
  const existingCodes = new Set(fixedSections.map((s) => s.course_code));

  const chooseTarget = (id: string | null) => {
    setTargetId(id);
    setGenerated(null); // fixed constraints changed — prior results are stale
  };

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const id = ++reqId.current;
      setSearching(true);
      try {
        const { items } = await fetchBrowseCourses(
          supabase,
          { search: query },
          0,
          8,
        );
        if (id === reqId.current) setResults(items);
      } catch {
        if (id === reqId.current) setResults([]);
      } finally {
        if (id === reqId.current) setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, supabase]);

  const addCourse = useCallback(
    async (c: BrowseCourse) => {
      setQuery("");
      setResults([]);
      setGenerated(null);
      setDesired((prev) =>
        prev.some((d) => d.course.courseId === c.courseId)
          ? prev
          : [...prev, { course: c, detail: null, loading: true, error: false }],
      );
      try {
        const detail = await fetchCourseDetail(supabase, c.courseId);
        setDesired((prev) =>
          prev.map((d) =>
            d.course.courseId === c.courseId
              ? { ...d, detail, loading: false, error: !detail }
              : d,
          ),
        );
      } catch {
        setDesired((prev) =>
          prev.map((d) =>
            d.course.courseId === c.courseId
              ? { ...d, loading: false, error: true }
              : d,
          ),
        );
      }
    },
    [supabase],
  );

  const removeCourse = (courseId: number) => {
    setDesired((prev) => prev.filter((d) => d.course.courseId !== courseId));
    setGenerated(null);
  };

  useEffect(() => setPresets(readPresets()), []);

  const openSavePreset = () => {
    const codes = desired.map((d) => courseCode(d.course.courseHeader));
    setPresetName(
      codes.length <= 2
        ? codes.join(" + ")
        : `${codes[0]} +${codes.length - 1} more`,
    );
    setSavePresetOpen(true);
  };

  const savePreset = () => {
    const name = presetName.trim();
    if (!name || desired.length === 0) return;
    const preset: Preset = {
      id: crypto.randomUUID(),
      name,
      courses: desired.map((d) => d.course),
    };
    setPresets((prev) => {
      const next = [...prev, preset];
      writePresets(next);
      return next;
    });
    setSavePresetOpen(false);
    toast({ title: `Saved “${name}”` });
  };

  const deletePreset = (id: string) =>
    setPresets((prev) => {
      const next = prev.filter((p) => p.id !== id);
      writePresets(next);
      return next;
    });

  // Replace the current courses with a preset's, then re-fetch each course's sections.
  const loadPreset = async (p: Preset) => {
    setQuery("");
    setResults([]);
    setGenerated(null);
    setDesired(
      p.courses.map((course) => ({
        course,
        detail: null,
        loading: true,
        error: false,
      })),
    );
    const loaded = await Promise.all(
      p.courses.map(async (course) => {
        try {
          return {
            courseId: course.courseId,
            detail: await fetchCourseDetail(supabase, course.courseId),
          };
        } catch {
          return { courseId: course.courseId, detail: null };
        }
      }),
    );
    setDesired((prev) =>
      prev.map((d) => {
        const r = loaded.find((x) => x.courseId === d.course.courseId);
        return r
          ? { ...d, detail: r.detail, loading: false, error: !r.detail }
          : d;
      }),
    );
  };

  const toggleDayOff = (d: number) =>
    setDaysOff((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d],
    );

  const resetFilters = () => {
    setDaysOff([]);
    setEarliest(null);
    setLatest(null);
    setGapRange(GAP_RANGE);
    setRatingRange(RATING_RANGE);
  };

  const activeFilters =
    (daysOff.length ? 1 : 0) +
    (earliest != null ? 1 : 0) +
    (latest != null ? 1 : 0) +
    (gapRange[0] !== GAP_RANGE[0] || gapRange[1] !== GAP_RANGE[1] ? 1 : 0) +
    (ratingRange[0] !== RATING_RANGE[0] || ratingRange[1] !== RATING_RANGE[1]
      ? 1
      : 0);

  const details = desired
    .map((d) => d.detail)
    .filter((x): x is RetrievedSection => !!x);
  // Courses already in the target are kept as fixed constraints, not re-scheduled.
  const newDetails = details.filter(
    (d) => !existingCodes.has(courseCode(d.course_header)),
  );
  const dupCount = details.length - newDetails.length;
  const ready = desired.length > 0 && desired.every((d) => !d.loading);

  const onGenerate = () => {
    if (!newDetails.length) {
      toast({
        variant: "destructive",
        title: dupCount
          ? "Those courses are already in this schedule."
          : "Couldn't load those courses. Try removing and re-adding.",
      });
      return;
    }
    const prefs: SchedulerPrefs = {
      earliestStartMin: earliest,
      latestEndMin: latest,
      requiredDaysOff: daysOff,
      rank: sortCatObj.rank,
      rankDir: sortDir,
      avoidBlocks: target?.blocks ?? [],
      minQuality: ratingRange[0] > RATING_RANGE[0] ? ratingRange[0] / 5 : null,
      maxQuality: ratingRange[1] < RATING_RANGE[1] ? ratingRange[1] / 5 : null,
      minGapMin: gapRange[0] > GAP_RANGE[0] ? gapRange[0] * 60 : null,
      maxGapMin: gapRange[1] < GAP_RANGE[1] ? gapRange[1] * 60 : null,
    };
    // Saved sections store meetings as {days,hours}; the engine parses schedule_days/_hours arrays.
    const fixed = fixedSections.map((s) => ({
      schedule_days: s.meetings.map((m) => m.days),
      schedule_hours: s.meetings.map((m) => m.hours),
    }));
    setVisibleCount(PAGE_SIZE);
    setGenerated(generateSchedules(newDetails, prefs, fixed));
    generatedOnce.current = true;
  };

  // After the first generation, changing any filter or the sort re-generates automatically (sliders commit on release, so this fires once per change — not on every drag tick).
  useEffect(() => {
    if (!generatedOnce.current || !ready || !newDetails.length) return;
    onGenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daysOff, earliest, latest, sortCat, sortDir, gapRange, ratingRange]);

  const onApply = async (sched: GeneratedSchedule, idx: number) => {
    setApplyingIdx(idx);
    let scheduleId = target?.id ?? null;
    let name = target?.name ?? "";
    if (!scheduleId) {
      const codes = sched.picks.map((p) => courseCode(p.course.course_header));
      name =
        codes.length <= 2
          ? codes.join(" + ")
          : `${codes[0]} +${codes.length - 1} more`;
      const row = await createSchedule(name);
      if (!row) {
        setApplyingIdx(null);
        return; // createSchedule surfaces its own error toast
      }
      scheduleId = row.id;
    }
    for (const p of sched.picks)
      await addSection(scheduleId, toScheduleSection(p.course, p.section));
    setActiveId(scheduleId); // calendar reads this from the shared store on arrival
    setApplyingIdx(null);
    setDesired([]);
    setGenerated(null);
    setTargetId(null);
    toast({
      title: target ? `Added to “${name}”` : `Created “${name}”`,
      description: "Opening your calendar…",
    });
    router.push("/calendar");
  };

  return (
    <div className="relative flex min-h-0 w-full flex-1 flex-col">
      <div className="shrink-0 border-b bg-background px-4 pb-3 pl-14 pt-5">
        <div className="flex items-center gap-2">
          <h2 className="shrink-0 text-lg font-semibold text-foreground">
            Build a Schedule
          </h2>
          <Badge
            variant="outline"
            className="shrink-0 border-texas/30 bg-texas/10 font-normal text-texas"
          >
            Fall 2026
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Add the courses you want and we&apos;ll find conflict-free options
          ranked by your preferences.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-4 py-5">
          {/* Target schedule + presets */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {schedules.length > 0 && (
                <>
                  <span className="text-xs font-medium text-muted-foreground">
                    Add to
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted">
                      {target ? target.name : "New schedule"}
                      <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="start"
                      className="max-h-60 overflow-y-auto"
                    >
                      <DropdownMenuItem onClick={() => chooseTarget(null)}>
                        New schedule
                      </DropdownMenuItem>
                      {schedules.map((s) => (
                        <DropdownMenuItem
                          key={s.id}
                          onClick={() => chooseTarget(s.id)}
                        >
                          {s.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  {target && (
                    <span className="text-[11px] text-muted-foreground">
                      fits around its {fixedSections.length} class
                      {fixedSections.length === 1 ? "" : "es"}
                    </span>
                  )}
                </>
              )}
            </div>

            <DropdownMenu open={presetsOpen} onOpenChange={setPresetsOpen}>
              <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted">
                <Bookmark className="h-3.5 w-3.5 opacity-70" />
                Presets
                <ChevronDown className="h-3.5 w-3.5 opacity-70" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuItem
                  disabled={desired.length === 0}
                  onClick={openSavePreset}
                >
                  <Bookmark className="mr-2 h-4 w-4" />
                  Save current
                  {desired.length > 0 ? ` (${desired.length})` : ""}
                </DropdownMenuItem>
                {presets.length > 0 && <DropdownMenuSeparator />}
                {presets.length === 0 ? (
                  <p className="px-2 py-1.5 text-xs text-muted-foreground">
                    No saved presets yet.
                  </p>
                ) : (
                  presets.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-1 rounded-sm px-1 hover:bg-muted"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          loadPreset(p);
                          setPresetsOpen(false);
                        }}
                        className="flex min-w-0 flex-1 items-center gap-2 rounded-sm px-1.5 py-1.5 text-left text-sm"
                      >
                        <span className="min-w-0 truncate">{p.name}</span>
                        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                          {p.courses.length}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => deletePreset(p.id)}
                        className="shrink-0 rounded-sm p-1 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
                        aria-label={`Delete preset ${p.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Course search */}
          <div className="relative" ref={inputWrapRef}>
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
              {searching ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Search className="h-3.5 w-3.5" />
              )}
            </span>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Add a course (e.g. C S 314, calculus)"
              className="pl-9"
            />
            {results.length > 0 && menuRect && (
              <div
                className="z-[60] max-h-60 overflow-y-auto rounded-lg border bg-background p-1 shadow-md"
                style={{
                  position: "fixed",
                  top: menuRect.top,
                  left: menuRect.left,
                  width: menuRect.width,
                }}
              >
                {results.map((c) => {
                  const code = courseCode(c.courseHeader);
                  const title = titleCase(
                    c.courseHeader.slice(code.length).trim(),
                  );
                  const added = desired.some(
                    (d) => d.course.courseId === c.courseId,
                  );
                  return (
                    <button
                      key={c.courseId}
                      type="button"
                      disabled={added}
                      onClick={() => addCourse(c)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-50"
                    >
                      <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 truncate">
                        <span className="font-semibold">{code}</span>
                        {title && (
                          <span className="text-muted-foreground">
                            {" "}
                            {title}
                          </span>
                        )}
                      </span>
                      {added && (
                        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                          Added
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Desired courses */}
          {desired.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {desired.map((d) => {
                const code = courseCode(d.course.courseHeader);
                return (
                  <span
                    key={d.course.courseId}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
                      d.error
                        ? "border-red-500/40 bg-red-500/10 text-red-500"
                        : "bg-muted",
                    )}
                  >
                    {d.loading && <Loader2 className="h-3 w-3 animate-spin" />}
                    <span className="font-medium">{code}</span>
                    {d.error && <span>· failed</span>}
                    <button
                      type="button"
                      onClick={() => removeCourse(d.course.courseId)}
                      className="rounded-full p-0.5 hover:bg-black/10"
                      aria-label={`Remove ${code}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                );
              })}
            </div>
          )}
          {dupCount > 0 && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {dupCount} already in this schedule, kept as-is.
            </p>
          )}

          {/* Sort + filters */}
          {desired.length > 0 && (
            <div className="mt-4 flex flex-wrap items-end gap-2">
              <div className="min-w-[140px] flex-1 sm:max-w-[190px]">
                <SelectMenu
                  label="Sort by"
                  value={sortCat}
                  options={SORT_CAT_OPTS}
                  onChange={(v) => {
                    setSortCat(v);
                    setGenerated(null);
                  }}
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  setSortDir((d) => (d === "desc" ? "asc" : "desc"));
                  setGenerated(null);
                }}
                title="Reverse order"
                className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
              >
                {sortDir === "desc" ? (
                  <ArrowDownWideNarrow className="h-3.5 w-3.5 opacity-70" />
                ) : (
                  <ArrowUpNarrowWide className="h-3.5 w-3.5 opacity-70" />
                )}
                {sortDir === "desc" ? sortCatObj.descLabel : sortCatObj.ascLabel}
              </button>
              <button
                type="button"
                onClick={() => setFilterOpen(true)}
                className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
              >
                <SlidersHorizontal className="h-3.5 w-3.5 opacity-70" />
                Filters
                {activeFilters > 0 && (
                  <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-texas px-1 text-[10px] font-semibold text-white">
                    {activeFilters}
                  </span>
                )}
              </button>
            </div>
          )}

          {/* Generate */}
          {desired.length > 0 && (
            <Button
              className="mt-4 w-full bg-texas text-white hover:bg-texas/90"
              onClick={onGenerate}
              disabled={!ready}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              {ready ? "Generate Schedules" : "Loading courses…"}
            </Button>
          )}

          {/* Results */}
          {generated && (
            <div className="mt-5">
              {generated.infeasible.length > 0 && (
                <p className="mb-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
                  No section fits your filters for{" "}
                  {generated.infeasible.join(", ")}. They were left out.
                </p>
              )}
              {generated.schedules.length === 0 ? (
                <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                  {activeFilters > 0
                    ? "No schedules match your filters. Try loosening your days off, time, gap, or rating filters."
                    : "No conflict-free schedule found."}
                  {generated.alwaysConflict.length > 0 && (
                    <>
                      {" "}
                      {generated.alwaysConflict
                        .map(([a, b]) => `${a} and ${b}`)
                        .join("; ")}{" "}
                      always overlap.
                    </>
                  )}
                </div>
              ) : (
                <>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    {generated.schedules.length} option
                    {generated.schedules.length === 1 ? "" : "s"}
                    {generated.truncated && " (showing the best)"}
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {generated.schedules.slice(0, visibleCount).map((s, i) => (
                      <ResultCard
                        key={i}
                        sched={s}
                        fixed={fixedSections}
                        applying={applyingIdx === i}
                        onApply={() => onApply(s, i)}
                        onPreview={() => setPreview({ sched: s, idx: i })}
                      />
                    ))}
                  </div>
                  {visibleCount < generated.schedules.length && (
                    <div className="mt-3 text-center">
                      <Button
                        variant="outline"
                        onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                      >
                        Show more ({generated.schedules.length - visibleCount}{" "}
                        left)
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Empty state */}
          {desired.length === 0 && (
            <div className="mx-auto flex max-w-sm flex-1 flex-col items-center justify-center gap-2 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                <Sparkles className="h-7 w-7 text-muted-foreground" />
              </div>
              <h3 className="text-base font-semibold">
                Start with your courses
              </h3>
              <p className="text-sm text-muted-foreground">
                Search and add the classes you need above, then generate ranked,
                conflict-free schedules.
              </p>
            </div>
          )}
        </div>
      </div>

      <Dialog open={savePresetOpen} onOpenChange={setSavePresetOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Save preset</DialogTitle>
            <DialogDescription>
              Save these {desired.length} course
              {desired.length === 1 ? "" : "s"} to load again later.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                savePreset();
              }
            }}
            placeholder="Preset name (e.g. Fall core)"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setSavePresetOpen(false)}>
              Cancel
            </Button>
            <Button onClick={savePreset} disabled={!presetName.trim()}>
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={filterOpen} onOpenChange={setFilterOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-texas" />
              Filters
            </DialogTitle>
            <DialogDescription>
              Only schedules matching every filter are shown.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div>
              <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Days off
              </span>
              <div className="flex flex-wrap gap-1.5">
                {DAY_LABELS.map((l, d) => (
                  <Pill
                    key={l}
                    active={daysOff.includes(d)}
                    onClick={() => toggleDayOff(d)}
                  >
                    {l}
                  </Pill>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Days you want completely free of classes.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <SelectMenu
                label="Start after"
                value={earliest}
                options={EARLIEST_OPTS}
                onChange={setEarliest}
              />
              <SelectMenu
                label="End before"
                value={latest}
                options={LATEST_OPTS}
                onChange={setLatest}
              />
            </div>

            <RangeField
              label="Gap hours / week"
              hint="Total idle time between back-to-back classes."
              value={gapRange}
              onChange={setGapRange}
              min={GAP_RANGE[0]}
              max={GAP_RANGE[1]}
              step={1}
              format={(v) => `${v}h`}
            />

            <RangeField
              label="Avg professor rating"
              hint="Averaged across the schedule’s professors (RMP / evals / grades)."
              value={ratingRange}
              onChange={setRatingRange}
              min={RATING_RANGE[0]}
              max={RATING_RANGE[1]}
              step={0.1}
              format={(v) => v.toFixed(1)}
            />
          </div>

          <div className="flex items-center justify-between gap-2 border-t pt-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={resetFilters}
              disabled={activeFilters === 0}
            >
              Reset
            </Button>
            <Button size="sm" onClick={() => setFilterOpen(false)}>
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-texas" />
              Schedule Preview
            </DialogTitle>
          </DialogHeader>
          {preview && (
            <>
              <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                <span className="whitespace-nowrap rounded-full border px-2 py-0.5">
                  <span className="font-semibold">Avg Prof:</span>{" "}
                  {(preview.sched.quality * 5).toFixed(1)}/5
                </span>
                <span className="whitespace-nowrap rounded-full border px-2 py-0.5">
                  <span className="font-semibold">Days Off:</span>{" "}
                  {preview.sched.daysOff.length
                    ? preview.sched.daysOff.map((d) => DAY_LABELS[d]).join(" ")
                    : "None"}
                </span>
                <span className="whitespace-nowrap rounded-full border px-2 py-0.5">
                  <span className="font-semibold">Gaps:</span>{" "}
                  {preview.sched.gapMinutes >= 60
                    ? `${(preview.sched.gapMinutes / 60).toFixed(1).replace(/\.0$/, "")}h/week`
                    : `${preview.sched.gapMinutes}m/week`}
                </span>
              </div>
              <PreviewGrid
                sched={preview.sched}
                fixed={fixedSections}
                onSelectCourse={setSelectedCourse}
              />
              <Button
                className="w-full"
                onClick={() => onApply(preview.sched, preview.idx)}
                disabled={applyingIdx === preview.idx}
              >
                {applyingIdx === preview.idx ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Use this schedule"
                )}
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>

      <CourseDialog
        section={selectedCourse}
        onClose={() => setSelectedCourse(null)}
      />
    </div>
  );
}

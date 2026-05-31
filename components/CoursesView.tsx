"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, SlidersHorizontal, ChevronDown, BookOpen, X } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { useToast } from "@/components/hooks/use-toast";
import {
  fetchBrowseCourses,
  fetchCourseDetail,
  fetchCourseSubjects,
  type BrowseCourse,
  type CourseFilters,
} from "@/lib/browse";
import { courseCode, titleCase, courseMeta, formatName, type RetrievedSection } from "@/lib/courses";
import { CourseDialog } from "@/components/CourseChips";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const LEVELS = [
  { value: "lower", label: "Lower-division" },
  { value: "upper", label: "Upper-division" },
  { value: "graduate", label: "Graduate" },
];

const CORE_CATEGORIES = [
  "American and Texas Government",
  "Communication",
  "First-Year Signature Course",
  "Humanities",
  "Mathematics",
  "Natural Science and Technology, Part I",
  "Natural Science and Technology, Part II",
  "Social and Behavioral Sciences",
  "U.S. History",
  "Visual and Performing Arts",
];

function FilterMenu({
  label,
  value,
  options,
  onChange,
  align = "start",
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  align?: "start" | "end";
}) {
  const active = value ? options.find((o) => o.value === value)?.label ?? value : null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex h-10 shrink-0 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors hover:bg-muted",
          active && "border-texas/40 bg-texas/10 text-texas"
        )}
      >
        {active ?? label}
        <ChevronDown className="h-3.5 w-3.5 opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="max-h-72 overflow-y-auto">
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          <DropdownMenuRadioItem value="" className="text-xs">
            {label}: Any
          </DropdownMenuRadioItem>
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value} className="text-xs">
              {o.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CourseRow({ c, onOpen }: { c: BrowseCourse; onOpen: () => void }) {
  const code = courseCode(c.courseHeader);
  const title = titleCase(c.courseHeader.slice(code.length).trim());
  const meta = courseMeta(code);
  const profs = c.instructors.map(formatName).filter(Boolean);
  const shownProfs = profs.slice(0, 3);
  const extra = profs.length - shownProfs.length;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-lg border bg-background p-3 text-left transition-colors hover:border-texas/60 hover:bg-muted/40"
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate">
          <span className="font-semibold text-foreground">{code}</span>
          {title && <span className="text-muted-foreground"> {title}</span>}
        </p>
        <span className="shrink-0 text-xs text-muted-foreground">
          {c.numSections} {c.numSections === 1 ? "section" : "sections"}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        {meta && (
          <Badge variant="secondary" className="font-normal">
            {meta.level}
          </Badge>
        )}
        {c.coreCurriculum.map((cc) => (
          <Badge key={cc} variant="outline" className="font-normal">
            {cc}
          </Badge>
        ))}
        {shownProfs.length > 0 && (
          <span className="truncate text-xs text-muted-foreground">
            {shownProfs.join(", ")}
            {extra > 0 && ` +${extra}`}
          </span>
        )}
      </div>
    </button>
  );
}

export default function CoursesView() {
  const [supabase] = useState(() => createClient());
  const { toast } = useToast();

  const [filters, setFilters] = useState<CourseFilters>({ search: "", subject: "", level: "", core: "" });
  const [items, setItems] = useState<BrowseCourse[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [subjects, setSubjects] = useState<{ value: string; label: string }[]>([]);

  const [openCourse, setOpenCourse] = useState<BrowseCourse | null>(null);
  const [detail, setDetail] = useState<RetrievedSection | null>(null);

  const reqId = useRef(0);
  const openRef = useRef<number | null>(null);

  useEffect(() => {
    fetchCourseSubjects(supabase)
      .then((rows) =>
        setSubjects(rows.map((r) => ({ value: r.subject, label: `${r.subject} (${r.n})` })))
      )
      .catch(() => setSubjects([]));
  }, [supabase]);

  const load = useCallback(
    async (f: CourseFilters) => {
      const id = ++reqId.current;
      setLoading(true);
      setError(false);
      try {
        const { items, total } = await fetchBrowseCourses(supabase, f, 0);
        if (id !== reqId.current) return;
        setItems(items);
        setTotal(total);
      } catch {
        if (id !== reqId.current) return;
        setError(true);
        setItems([]);
        setTotal(0);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [supabase]
  );

  // Debounce filter changes (search typing especially) into a single fetch.
  useEffect(() => {
    const t = setTimeout(() => load(filters), 300);
    return () => clearTimeout(t);
  }, [filters, load]);

  const loadMore = async () => {
    const id = reqId.current;
    setLoadingMore(true);
    try {
      const { items: more } = await fetchBrowseCourses(supabase, filters, items.length);
      if (id !== reqId.current) return;
      setItems((prev) => [...prev, ...more]);
    } catch {
      // keep what's shown; the load-more button stays for a retry
    } finally {
      if (id === reqId.current) setLoadingMore(false);
    }
  };

  const openDetail = useCallback(
    async (c: BrowseCourse) => {
      openRef.current = c.courseId;
      setOpenCourse(c);
      setDetail(null);
      try {
        const d = await fetchCourseDetail(supabase, c.courseId);
        if (openRef.current !== c.courseId) return; // user closed/switched while loading
        if (!d) {
          openRef.current = null;
          setOpenCourse(null);
          toast({ variant: "destructive", title: "Course details unavailable" });
          return;
        }
        setDetail(d);
      } catch {
        if (openRef.current !== c.courseId) return;
        openRef.current = null;
        setOpenCourse(null);
        toast({ variant: "destructive", title: "Couldn't load course details" });
      }
    },
    [supabase, toast]
  );

  const closeDetail = () => {
    openRef.current = null;
    setOpenCourse(null);
    setDetail(null);
  };

  const hasFilters = !!(filters.search || filters.subject || filters.level || filters.core);
  const clearFilters = () => setFilters({ search: "", subject: "", level: "", core: "" });
  const set = (patch: Partial<CourseFilters>) => setFilters((f) => ({ ...f, ...patch }));

  return (
    <div className="relative flex min-h-0 w-full flex-1 flex-col">
      <div className="shrink-0 border-b bg-background px-4 pb-3 pl-14 pt-5">
        <div className="flex items-center gap-2">
          <h2 className="shrink-0 text-lg font-semibold text-foreground">Courses</h2>
          <Badge variant="outline" className="shrink-0 border-texas/30 bg-texas/10 font-normal text-texas">
            Fall 2026
          </Badge>
          <Badge variant="secondary" className="shrink-0 font-normal">
            {total.toLocaleString()} {total === 1 ? "course" : "courses"}
          </Badge>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[14rem] flex-1">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
              <Search className="h-3.5 w-3.5" />
            </span>
            <Input
              value={filters.search ?? ""}
              onChange={(e) => set({ search: e.target.value })}
              placeholder="Search by code or title (e.g. C S 314, calculus)"
              className="pl-9"
            />
          </div>
          <FilterMenu
            label="Subject"
            value={filters.subject ?? ""}
            options={subjects}
            onChange={(v) => set({ subject: v })}
          />
          <FilterMenu
            label="Level"
            value={filters.level ?? ""}
            options={LEVELS}
            onChange={(v) => set({ level: v })}
          />
          <FilterMenu
            label="Core"
            value={filters.core ?? ""}
            options={CORE_CATEGORIES.map((c) => ({ value: c, label: c }))}
            onChange={(v) => set({ core: v })}
            align="end"
          />
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
              <X className="mr-1 h-3.5 w-3.5" />
              Clear
            </Button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-2 px-4 py-5">
          {loading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-[4.75rem] w-full rounded-lg" />
            ))
          ) : error ? (
            <EmptyState
              icon={<SlidersHorizontal className="h-8 w-8 text-muted-foreground" />}
              title="Couldn't load courses"
              body="Something went wrong fetching the catalog. Try again."
              action={
                <Button variant="outline" onClick={() => load(filters)}>
                  Retry
                </Button>
              }
            />
          ) : items.length === 0 ? (
            <EmptyState
              icon={<BookOpen className="h-8 w-8 text-muted-foreground" />}
              title="No courses found"
              body={
                hasFilters
                  ? "No courses match these filters. Try clearing some."
                  : "No courses are available."
              }
              action={
                hasFilters ? (
                  <Button variant="outline" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              {items.map((c) => (
                <CourseRow key={c.courseId} c={c} onOpen={() => openDetail(c)} />
              ))}
              {items.length < total && (
                <div className="pt-2 text-center">
                  <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
                    {loadingMore ? "Loading…" : `Load more (${(total - items.length).toLocaleString()} left)`}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <CourseDialog section={detail} loading={!!openCourse && !detail} onClose={closeDetail} />
    </div>
  );
}

function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-3 pt-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">{icon}</div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">{body}</p>
      {action}
    </div>
  );
}

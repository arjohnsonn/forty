"use client";

import { useEffect, useState } from "react";
import { Star, ExternalLink, X, ChevronDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";

export type RmpPanelProf = { legacyId: number; name: string; department: string | null };

type Review = {
  course: string | null;
  grade: string | null;
  date: string | null;
  quality: number;
  difficulty: number | null;
  wouldTakeAgain: boolean | null;
  comment: string;
  tags: string[];
};

type RmpDetail = {
  legacyId: number;
  name: string;
  department: string | null;
  overall: { rating: number | null; difficulty: number | null; wouldTakeAgain: number | null; numRatings: number };
  distribution: { r1: number; r2: number; r3: number; r4: number; r5: number; total: number } | null;
  tags: { tag: string; count: number }[];
  courses: { code: string; rating: number; difficulty: number; wouldTakeAgain: number | null; numRatings: number }[];
  reviews: Review[];
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{children}</p>;
}

// RMP-style: green→red by quality, gray-scaled by difficulty. Dark text sits on the pastel fill.
function qualityColor(v: number | null): string {
  if (v == null) return "bg-muted";
  if (v >= 4) return "bg-emerald-300";
  if (v >= 3) return "bg-lime-300";
  if (v >= 2) return "bg-amber-300";
  return "bg-red-300";
}
function difficultyColor(v: number | null): string {
  if (v == null) return "bg-muted";
  if (v >= 4) return "bg-zinc-500";
  if (v >= 3) return "bg-zinc-400";
  if (v >= 2) return "bg-zinc-300";
  return "bg-zinc-200";
}

// Letter-grade chip color (A green → F red); anything non-letter stays neutral.
function gradeColor(grade: string): string {
  const g = grade.trim().toUpperCase()[0];
  if (g === "A") return "bg-emerald-300 text-zinc-900";
  if (g === "B") return "bg-lime-300 text-zinc-900";
  if (g === "C") return "bg-amber-300 text-zinc-900";
  if (g === "D") return "bg-orange-300 text-zinc-900";
  if (g === "F") return "bg-red-300 text-zinc-900";
  return "bg-muted text-foreground";
}

function MetaLabel({ children }: { children: React.ReactNode }) {
  return <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{children}</span>;
}

function RmpBox({ label, value, bg }: { label: string; value: string; bg: string }) {
  return (
    <div className="text-center">
      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className={`flex items-center justify-center rounded-md py-4 ${bg}`}>
        <span className="text-3xl font-extrabold text-zinc-900">{value}</span>
      </div>
    </div>
  );
}

// "2026-05-29 16:11:49 +0000 UTC" -> "May 2026"
function shortDate(raw: string | null): string {
  if (!raw) return "";
  const d = new Date(raw.replace(" +0000 UTC", "Z").replace(" ", "T"));
  return isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function Distribution({ d }: { d: NonNullable<RmpDetail["distribution"]> }) {
  const rows = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: (d as any)[`r${star}`] as number,
  }));
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.star} className="flex items-center gap-2 text-xs">
          <span className="w-3 text-muted-foreground">{r.star}</span>
          <Star className="h-3 w-3 shrink-0 fill-yellow-400 text-yellow-400" />
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-yellow-400/80" style={{ width: `${(r.count / max) * 100}%` }} />
          </div>
          <span className="w-6 text-right tabular-nums text-muted-foreground">{r.count}</span>
        </div>
      ))}
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-16 w-full rounded-lg" />
      <Skeleton className="h-28 w-full rounded-lg" />
      <Skeleton className="h-24 w-full rounded-lg" />
      <Skeleton className="h-20 w-full rounded-lg" />
    </div>
  );
}

function ReviewCard({ r }: { r: Review }) {
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {r.course && <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold">{r.course}</span>}
          {r.grade && (
            <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${gradeColor(r.grade)}`}>{r.grade}</span>
          )}
          {r.quality > 0 && (
            <MetaLabel>
              <span className="font-semibold text-foreground">Quality</span> {r.quality.toFixed(1)}/5
            </MetaLabel>
          )}
          {r.difficulty != null && (
            <MetaLabel>
              <span className="font-semibold text-foreground">Difficulty</span> {r.difficulty}/5
            </MetaLabel>
          )}
        </div>
        {r.date && <span className="shrink-0 text-[11px] text-muted-foreground">{shortDate(r.date)}</span>}
      </div>
      {r.comment && <p className="text-sm leading-snug">{r.comment}</p>}
      {r.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {r.tags.map((t) => (
            <span key={t} className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewList({ reviews, loading, emptyLabel }: { reviews: Review[]; loading: boolean; emptyLabel: string }) {
  if (loading)
    return (
      <div className="space-y-2">
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-20 w-full rounded-lg" />
      </div>
    );
  if (!reviews.length) return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  return (
    <div className="space-y-2">
      {reviews.map((r, i) => (
        <ReviewCard key={i} r={r} />
      ))}
    </div>
  );
}

export default function ProfessorRmpPanel({ prof, onClose }: { prof: RmpPanelProf; onClose: () => void }) {
  const [data, setData] = useState<RmpDetail | null>(null);
  const [error, setError] = useState(false);
  const [course, setCourse] = useState("all");
  const [courseReviews, setCourseReviews] = useState<Review[] | null>(null);
  const [reviewsLoading, setReviewsLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setData(null);
    setError(false);
    setCourse("all");
    setCourseReviews(null);
    fetch(`/api/rmp/${prof.legacyId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d) => active && setData(d))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, [prof.legacyId]);

  // Filtering reviews to a course fetches just that course's reviews on demand.
  useEffect(() => {
    if (course === "all") {
      setCourseReviews(null);
      return;
    }
    let active = true;
    setReviewsLoading(true);
    fetch(`/api/rmp/${prof.legacyId}?course=${encodeURIComponent(course)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d) => active && setCourseReviews(d.reviews ?? []))
      .catch(() => active && setCourseReviews([]))
      .finally(() => active && setReviewsLoading(false));
    return () => {
      active = false;
    };
  }, [prof.legacyId, course]);

  return (
    <div className="flex max-h-[85vh] flex-col">
      <header className="flex shrink-0 items-start justify-between gap-2 border-b p-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight">{data?.name ?? prof.name}</p>
          {(data?.department ?? prof.department) && (
            <p className="truncate text-xs text-muted-foreground">{data?.department ?? prof.department}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <a
            href={`https://www.ratemyprofessors.com/professor/${prof.legacyId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-sm p-1 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Open on RateMyProfessors"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm p-1 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        {error ? (
          <p className="text-sm text-muted-foreground">Couldn&apos;t load RateMyProfessors data. Try again later.</p>
        ) : !data ? (
          <PanelSkeleton />
        ) : (
          <>
            <section className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <RmpBox
                  label="Quality"
                  value={data.overall.rating?.toFixed(1) ?? "N/A"}
                  bg={qualityColor(data.overall.rating)}
                />
                <RmpBox
                  label="Difficulty"
                  value={data.overall.difficulty?.toFixed(1) ?? "N/A"}
                  bg={difficultyColor(data.overall.difficulty)}
                />
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {data.overall.wouldTakeAgain != null && (
                  <MetaLabel>
                    <span className="font-semibold text-foreground">{data.overall.wouldTakeAgain}%</span> would take again
                  </MetaLabel>
                )}
                <MetaLabel>
                  <span className="font-semibold text-foreground">{data.overall.numRatings}</span> ratings
                </MetaLabel>
              </div>
            </section>

            {data.distribution && data.distribution.total > 0 && (
              <section className="space-y-2">
                <SectionLabel>Rating distribution</SectionLabel>
                <Distribution d={data.distribution} />
              </section>
            )}

            {data.courses.length > 0 && (
              <section className="space-y-2">
                <SectionLabel>By course</SectionLabel>
                <div className="overflow-hidden rounded-lg border">
                  <div className="grid grid-cols-[1fr_3.5rem_3.5rem] gap-x-4 bg-muted/50 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    <span>Course</span>
                    <span className="text-right">Rating</span>
                    <span className="text-right">Diff.</span>
                  </div>
                  <div className="divide-y">
                    {data.courses.map((c) => (
                      <div key={c.code} className="grid grid-cols-[1fr_3.5rem_3.5rem] items-center gap-x-4 px-3 py-1.5 text-sm">
                        <span className="truncate font-medium">
                          {c.code}
                          <span className="ml-1.5 text-xs font-normal text-muted-foreground">{c.numRatings}</span>
                        </span>
                        <span className="text-right tabular-nums">{c.rating.toFixed(1)}</span>
                        <span className="text-right tabular-nums text-muted-foreground">{c.difficulty.toFixed(1)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {data.tags.length > 0 && (
              <section className="space-y-2">
                <SectionLabel>Top tags</SectionLabel>
                <div className="flex flex-wrap gap-1.5">
                  {data.tags.map((t) => (
                    <span key={t.tag} className="rounded-full bg-muted px-2.5 py-1 text-xs">
                      {t.tag} <span className="text-muted-foreground">{t.count}</span>
                    </span>
                  ))}
                </div>
              </section>
            )}

            {(data.reviews.length > 0 || data.courses.length > 0) && (
              <section className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <SectionLabel>{course === "all" ? "Recent reviews" : "Reviews"}</SectionLabel>
                  {data.courses.length > 0 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted">
                        {course === "all" ? "All courses" : course}
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="max-h-64 overflow-y-auto">
                        <DropdownMenuRadioGroup value={course} onValueChange={setCourse}>
                          <DropdownMenuRadioItem value="all" className="text-xs">
                            All courses
                          </DropdownMenuRadioItem>
                          {data.courses.map((c) => (
                            <DropdownMenuRadioItem key={c.code} value={c.code} className="text-xs">
                              {c.code}
                            </DropdownMenuRadioItem>
                          ))}
                        </DropdownMenuRadioGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
                <ReviewList
                  reviews={course === "all" ? data.reviews : courseReviews ?? []}
                  loading={course !== "all" && reviewsLoading}
                  emptyLabel={course === "all" ? "No reviews yet." : `No reviews for ${course}.`}
                />
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

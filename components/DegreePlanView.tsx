"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Check, ChevronDown, Loader2, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CourseDialog } from "@/components/CourseChips";
import { useToast } from "@/components/hooks/use-toast";
import { createClient } from "@/utils/supabase/client";
import { fetchCourseDetail, type BrowseCourse } from "@/lib/browse";
import { courseMeta, titleCase, type RetrievedSection } from "@/lib/courses";
import { CURRENT_TERM } from "@/lib/term";
import {
  BUILD_HANDOFF_KEY,
  DEFAULT_FILTERS,
  normalizeCode,
  openRequirements,
  parseAudit,
  type AuditResult,
  type AuditSuggestion,
  type ParsedAudit,
  type PlanFilters,
} from "@/lib/audit";
import { analyzeAudit } from "@/lib/degree-plan";
import { cn } from "@/lib/utils";

type Saved = { audit: ParsedAudit; result: AuditResult; updated_at: string };


const toBrowseCourse = (s: AuditSuggestion): BrowseCourse => ({
  courseId: s.courseId,
  courseHeader: s.courseHeader,
  courseCode: s.courseCode,
  numSections: s.numSections,
  instructors: s.instructors,
  instructionModes: s.instructionModes,
  coreCurriculum: s.coreCurriculum,
});

export default function DegreePlanView() {
  const router = useRouter();
  const { toast } = useToast();
  const [supabase] = useState(() => createClient());
  const [saved, setSaved] = useState<Saved | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [text, setText] = useState("");
  const [parseError, setParseError] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [hideUnmet, setHideUnmet] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [openCourse, setOpenCourse] = useState<AuditSuggestion | null>(null);
  const [detail, setDetail] = useState<RetrievedSection | null>(null);
  const openRef = useRef<number | null>(null);
  const [applying, setApplying] = useState(false);
  const filterReq = useRef(0);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("degree_audits")
        .select("audit, result, updated_at")
        .maybeSingle();
      if (error) toast({ variant: "destructive", title: "Couldn't load your IDA plan" });
      const stored = (data as Saved | null) ?? null;
      setSaved(stored);
      setLoading(false);
      if (!stored) return;
      try {
        const result = await analyzeAudit(supabase, stored.audit, stored.result.filters ?? DEFAULT_FILTERS);
        const updated_at = new Date().toISOString();
        setSaved((cur) => (cur === stored ? { ...stored, result, updated_at } : cur));
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session) {
          await supabase
            .from("degree_audits")
            .update({ result, updated_at })
            .eq("user_id", session.user.id)
            .eq("updated_at", stored.updated_at);
        }
      } catch (e) {
        console.error("[AuditDebug] refresh failed:", e);
      }
    })();
  }, [supabase, toast]);

  const analyze = async () => {
    let audit: ParsedAudit;
    try {
      audit = parseAudit(text);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "That doesn't look like a degree audit.");
      return;
    }
    setParseError("");
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      toast({ variant: "destructive", title: "Couldn't analyze your audit", description: "Sign in again and retry." });
      return;
    }
    setAnalyzing(true);
    try {
      const result = await analyzeAudit(supabase, audit, saved?.result.filters ?? DEFAULT_FILTERS);
      const updated_at = new Date().toISOString();
      const { error } = await supabase
        .from("degree_audits")
        .upsert({ user_id: session.user.id, audit, result, updated_at });
      if (error) throw error;
      setSaved({ audit, result, updated_at });
      setImporting(false);
      setText("");
    } catch (e) {
      console.error("[AuditDebug] analyze failed:", e);
      toast({ variant: "destructive", title: "Couldn't analyze your audit", description: "Please try again." });
    } finally {
      setAnalyzing(false);
    }
  };

  const applyFilters = async (filters: PlanFilters) => {
    if (!saved) return;
    const base = saved;
    const req = ++filterReq.current;
    setApplying(true);
    try {
      const result = await analyzeAudit(supabase, base.audit, filters);
      if (req !== filterReq.current) return;
      const updated_at = new Date().toISOString();
      setSaved((cur) => (cur?.audit === base.audit ? { ...cur, result, updated_at } : cur));
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const { error } = session
        ? await supabase.from("degree_audits").update({ result, updated_at }).eq("user_id", session.user.id)
        : { error: new Error("signed out") };
      if (error) toast({ variant: "destructive", title: "Couldn't save your filters", description: "They'll reset on reload." });
    } catch (e) {
      console.error("[AuditDebug] filters failed:", e);
      if (req === filterReq.current) toast({ variant: "destructive", title: "Couldn't apply filters", description: "Please try again." });
    } finally {
      if (req === filterReq.current) setApplying(false);
    }
  };

  const deleteAudit = async () => {
    setConfirmDelete(false);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const { error } = session
      ? await supabase.from("degree_audits").delete().eq("user_id", session.user.id)
      : { error: new Error("signed out") };
    if (error) {
      toast({ variant: "destructive", title: "Couldn't delete your IDA plan" });
      return;
    }
    setSaved(null);
    toast({ title: "IDA plan deleted" });
  };

  const openDetail = useCallback(
    async (s: AuditSuggestion) => {
      openRef.current = s.courseId;
      setOpenCourse(s);
      setDetail(null);
      try {
        const d = await fetchCourseDetail(supabase, s.courseId);
        if (openRef.current !== s.courseId) return;
        if (!d) throw new Error("missing");
        setDetail(d);
      } catch {
        if (openRef.current !== s.courseId) return;
        openRef.current = null;
        setOpenCourse(null);
        toast({ variant: "destructive", title: "Couldn't load course details" });
      }
    },
    [supabase, toast],
  );

  const closeDetail = () => {
    openRef.current = null;
    setOpenCourse(null);
    setDetail(null);
  };

  const suggestionByCode = useMemo(() => {
    const map = new Map<string, AuditSuggestion>();
    for (const r of saved?.result.requirements ?? [])
      for (const s of r.suggestions) {
        const code = normalizeCode(s.courseCode ?? "");
        if (code && !map.has(code)) map.set(code, s);
      }
    return map;
  }, [saved]);

  const buildTerm = (codes: string[]) => {
    const courses = codes
      .map((c) => suggestionByCode.get(c))
      .filter((s): s is AuditSuggestion => !!s)
      .map(toBrowseCourse);
    if (!courses.length) return;
    try {
      window.sessionStorage.setItem(BUILD_HANDOFF_KEY, JSON.stringify({ id: "audit", name: `${CURRENT_TERM} plan`, courses }));
    } catch {
      toast({ variant: "destructive", title: "Couldn't open the schedule builder" });
      return;
    }
    router.push("/build");
  };

  const showImport = importing || (!loading && !saved);

  return (
    <div className="relative flex min-h-0 w-full flex-1 flex-col">
      <div className="shrink-0 border-b bg-background px-4 pb-3 pl-14 pt-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="shrink-0 text-lg font-medium text-foreground">IDA Planner</h2>
          {saved && !importing && (
            <>
              {saved.audit.program && (
                <Badge variant="secondary" className="shrink-0 font-normal">
                  {saved.audit.program}
                </Badge>
              )}
              <div className="ml-auto flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => setImporting(true)}>
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  Update audit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Delete IDA plan"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste your degree audit to see what&apos;s left, what to take in {CURRENT_TERM}, and a path to graduation.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-5">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : showImport ? (
            <section className="space-y-3">
              <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                <li>
                  Open your audit in{" "}
                  <a
                    href="https://utdirect.utexas.edu/apps/degree/audits/"
                    target="_blank"
                    rel="noreferrer"
                    className="text-texas underline-offset-2 hover:underline"
                  >
                    IDA
                  </a>
                  .
                </li>
                <li>Select everything on the page (⌘A / Ctrl+A) and copy it.</li>
                <li>Paste it below. Your name and EID are never saved.</li>
              </ol>
              <Textarea
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setParseError("");
                }}
                placeholder="Paste your degree audit here"
                className="min-h-[220px] font-mono text-xs"
                disabled={analyzing}
              />
              {parseError && <p className="text-sm text-destructive">{parseError}</p>}
              <div className="flex items-center gap-2">
                <Button
                  className="bg-texas text-white hover:bg-texas/90"
                  disabled={!text.trim() || analyzing}
                  onClick={analyze}
                >
                  {analyzing ? (
                    <>
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      Analyzing…
                    </>
                  ) : (
                    "Analyze audit"
                  )}
                </Button>
                {saved && (
                  <Button variant="ghost" disabled={analyzing} onClick={() => setImporting(false)}>
                    Cancel
                  </Button>
                )}
              </div>
            </section>
          ) : saved ? (
            <Results
              saved={saved}
              hideUnmet={hideUnmet}
              setHideUnmet={setHideUnmet}
              onOpen={openDetail}
              onBuild={buildTerm}
              byCode={suggestionByCode}
              onFilters={applyFilters}
              applying={applying}
              onUpdate={() => setImporting(true)}
            />
          ) : null}
        </div>
      </div>

      <CourseDialog section={detail} loading={!!openCourse && !detail} onClose={closeDetail} />

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete your IDA plan?</DialogTitle>
            <DialogDescription>This removes your saved audit and plan. You can paste it again anytime.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={deleteAudit}>
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const HOUR_OPTIONS = [12, 13, 14, 15, 16, 17, 18];
const GPA_OPTIONS = [2.5, 3.0, 3.3, 3.5, 3.7];
const RATING_OPTIONS = [3.5, 4.0, 4.3, 4.5];

const MINOR_WORDS = new Set(["a", "an", "and", "at", "for", "in", "of", "on", "or", "the", "to", "with"]);
const titleOf = (s: AuditSuggestion) =>
  titleCase(
    s.courseHeader
      .slice((s.courseCode ?? "").length)
      .replace(/-(?:WB|DEN|DAL|HOU|UTNY|DC|TEMBA|FRI)?$/, "")
      .trim(),
  )
    .split(" ")
    .map((w, i) => (i > 0 && MINOR_WORDS.has(w.toLowerCase()) ? w.toLowerCase() : /^(I|Ii|Iii|Iv)$/.test(w) ? w.toUpperCase() : w))
    .join(" ")
    .replace(/\/([a-z])/g, (_, c: string) => `/${c.toUpperCase()}`);
const heading = (text: string) => text.replace(/\.$/, "");

function Results({
  saved,
  hideUnmet,
  setHideUnmet,
  onOpen,
  onBuild,
  byCode,
  onFilters,
  applying,
  onUpdate,
}: {
  saved: Saved;
  hideUnmet: boolean;
  setHideUnmet: (v: boolean) => void;
  onOpen: (s: AuditSuggestion) => void;
  onBuild: (codes: string[]) => void;
  byCode: Map<string, AuditSuggestion>;
  onFilters: (f: PlanFilters) => void;
  applying: boolean;
  onUpdate: () => void;
}) {
  const { audit, result } = saved;
  const filters = result.filters ?? DEFAULT_FILTERS;
  const open = openRequirements(audit);
  const planById = new Map(result.requirements.map((r) => [r.id, r]));
  const done = audit.requirements.filter((r) => r.status === "completed");
  const courseReqs = open.filter((r) => {
    const kind = planById.get(r.id)?.kind;
    return kind === "courses" || kind === "pool";
  });
  const otherReqs = open.filter((r) => !courseReqs.includes(r));
  const pct =
    audit.hoursCompleted != null && audit.hoursRequired
      ? Math.min(100, Math.round((audit.hoursCompleted / audit.hoursRequired) * 100))
      : null;

  return (
    <div className="space-y-10">
      {result.term !== CURRENT_TERM && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
          <span>
            This plan was made for {result.term}. Update your audit for {CURRENT_TERM} suggestions
          </span>
          <Button size="sm" variant="outline" onClick={onUpdate}>
            Update
          </Button>
        </div>
      )}

      <section className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm">
            <span className="font-medium">{open.length}</span>
            <span className="text-muted-foreground"> requirement{open.length === 1 ? "" : "s"} left</span>
          </p>
          {pct != null && (
            <p className="font-mono text-xs tabular-nums text-muted-foreground">
              {audit.hoursCompleted} of {audit.hoursRequired} hours
            </p>
          )}
        </div>
        {pct != null && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-texas" style={{ width: `${pct}%` }} />
          </div>
        )}
      </section>

      <FilterBar filters={filters} onChange={onFilters} applying={applying} />

      {result.plan.length > 0 && (
        <section className="space-y-4">
          <SectionTitle>Path to graduation</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-[repeat(auto-fit,minmax(13rem,1fr))]">
            {result.plan.map((t) => {
              const codes = t.courses.map((c) => c.code);
              const hours = codes.reduce((n, c) => n + (courseMeta(c)?.credits ?? 0), 0);
              const current = t.term === CURRENT_TERM;
              const buildable = current && codes.some((c) => byCode.has(c));
              return (
                <div
                  key={t.term}
                  className={cn("flex flex-col rounded-xl border bg-card p-4", current && "border-texas/40")}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={cn("text-sm font-medium", current && "text-texas")}>{t.term}</span>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">{hours} hrs</span>
                  </div>
                  <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full", current ? "bg-texas" : "bg-muted-foreground/40")}
                      style={{ width: `${Math.min(100, (hours / filters.maxHours) * 100)}%` }}
                    />
                  </div>
                  <ul className="mt-3 flex-1 space-y-2">
                    {t.courses.map((c) => {
                      const s = byCode.get(c.code);
                      return (
                        <li key={c.code} className="text-sm leading-snug">
                          {s ? (
                            <button
                              type="button"
                              onClick={() => onOpen(s)}
                              className="text-left transition-colors hover:text-texas"
                            >
                              <span className="font-mono">{c.code}</span>
                              <span className="block text-xs text-muted-foreground">{titleOf(s)}</span>
                            </button>
                          ) : (
                            <span className="font-mono">{c.code}</span>
                          )}
                          {c.warning && (
                            <span className="mt-0.5 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                              <TriangleAlert className="h-3 w-3 shrink-0" />
                              {c.warning}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {buildable && (
                    <Button size="sm" variant="outline" className="mt-4 w-full" onClick={() => onBuild(codes)}>
                      <CalendarPlus className="mr-1.5 h-3.5 w-3.5" />
                      Build this schedule
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
          {result.notes.length > 0 && (
            <ul className="space-y-1 text-sm text-muted-foreground">
              {result.notes.map((n) => (
                <li key={n} className="flex gap-2">
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {n}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            Built from your audit, catalog prerequisites, and past offering patterns. Confirm with your advisor before
            registering.
          </p>
        </section>
      )}

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <SectionTitle>What&apos;s left</SectionTitle>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <Checkbox checked={hideUnmet} onCheckedChange={(v) => setHideUnmet(v === true)} />
            Hide unmet prereqs
          </label>
        </div>
        {courseReqs.length > 0 && (
          <p className="-mt-2 hidden text-xs text-muted-foreground sm:block">
            GPA is the course average since Fall 2020, and the rating is the instructor score from course evaluations
          </p>
        )}
        {open.length === 0 && (
          <p className="text-sm text-muted-foreground">Every requirement on your audit is complete or in progress</p>
        )}
        {courseReqs.map((r) => {
          const plan = planById.get(r.id)!;
          const suggestions = plan.suggestions.filter((s) => !hideUnmet || s.prereq !== "not_met");
          const hidden = plan.suggestions.length - suggestions.length;
          const picks = result.plan.flatMap((t) =>
            t.courses.filter((c) => c.requirementId === r.id).map((c) => `${c.code} · ${t.term}`),
          );
          return (
            <details key={r.id} className="group/req rounded-xl border bg-card">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-4 rounded-xl p-5 transition-colors hover:bg-muted/30 [&::-webkit-details-marker]:hidden">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{r.section}</p>
                  <p className="mt-1 text-sm font-medium">{heading(plan.note || r.text)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {picks.length ? (
                      <>
                        Planned: <span className="font-mono text-foreground">{picks.join(", ")}</span>
                      </>
                    ) : (
                      `${plan.suggestions.length} option${plan.suggestions.length === 1 ? "" : "s"} in ${CURRENT_TERM}`
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {r.lacking && (
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">{r.lacking} left</span>
                  )}
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open/req:rotate-180" />
                </div>
              </summary>
              <div className="px-5 pb-5">
                <details className="group/wording">
                  <summary className="cursor-pointer list-none text-xs text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
                    <span className="group-open/wording:hidden">Show audit wording</span>
                    <span className="hidden group-open/wording:inline">Hide audit wording</span>
                  </summary>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{r.text}</p>
                </details>

              {suggestions.length > 0 && (
                <ul className="mt-4 divide-y border-t">
                  {suggestions.map((s) => (
                    <li key={s.courseId}>
                      <button
                        type="button"
                        onClick={() => onOpen(s)}
                        className="grid w-full grid-cols-[5.5rem_1fr_auto] items-center gap-x-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/40 sm:grid-cols-[5.5rem_1fr_4.5rem_4.5rem_8rem]"
                      >
                        <span className="font-mono font-medium">{s.courseCode}</span>
                        <span className="min-w-0 truncate">{titleOf(s)}</span>
                        <span className="hidden text-right font-mono text-xs tabular-nums text-muted-foreground sm:block">
                          {s.gpa != null ? `${s.gpa.toFixed(2)} GPA` : "–"}
                        </span>
                        <span className="hidden text-right font-mono text-xs tabular-nums text-muted-foreground sm:block">
                          {s.cesRating != null ? `${s.cesRating.toFixed(1)} / 5` : "–"}
                        </span>
                        <PrereqLabel s={s} />
                        {s.topicRepeat && (
                          <span className="col-span-full pt-1 text-xs text-muted-foreground">
                            You&apos;ve taken a {s.courseCode} topic before, so pick a different one
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {(hidden > 0 || !!plan.filteredOut) && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {[
                    hidden > 0 && `${hidden} hidden for unmet prerequisites`,
                    plan.filteredOut && `${plan.filteredOut} hidden by your filters`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
              {plan.notOffered.map((n) => (
                <p key={n.code} className="mt-2 text-xs text-muted-foreground">
                  <span className="font-mono">{n.code}</span> isn&apos;t offered in {CURRENT_TERM}
                  {n.seasons.length ? `, usually ${n.seasons.join(" and ")}` : ""}
                </p>
              ))}
              {!plan.suggestions.length && !plan.notOffered.length && !plan.filteredOut && (
                <p className="mt-3 text-xs text-muted-foreground">No matching {CURRENT_TERM} courses found</p>
              )}
              </div>
            </details>
          );
        })}

        {otherReqs.length > 0 && (
          <div className="rounded-xl border bg-card p-5">
            <p className="text-sm font-medium">Hours and other rules</p>
            <p className="mt-1 text-xs text-muted-foreground">Courses in your plan count toward these</p>
            <ul className="mt-3 divide-y border-t">
              {otherReqs.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-4 py-2.5 text-sm text-muted-foreground">
                  <span className="min-w-0">{r.text}</span>
                  {/\d/.test(r.lacking) && (
                    <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                      {r.lacking} left
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {done.length > 0 && (
          <details className="group rounded-xl border bg-card px-5 py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm">
              <span className="font-medium">Completed</span>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">{done.length}</span>
            </summary>
            <ul className="mt-3 space-y-2 border-t pt-3">
              {done.map((r) => (
                <li key={r.id} className="flex gap-2 text-sm text-muted-foreground">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{r.text}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </div>
  );
}

function FilterBar({
  filters,
  onChange,
  applying,
}: {
  filters: PlanFilters;
  onChange: (f: PlanFilters) => void;
  applying: boolean;
}) {
  const isDefault =
    filters.maxHours === DEFAULT_FILTERS.maxHours &&
    filters.minGpa == null &&
    filters.minRating == null &&
    filters.minRmp == null;
  const strict = filters.minGpa != null || filters.minRating != null || filters.minRmp != null;
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <FilterMenu
          label="Per semester"
          value={`${filters.maxHours} hrs max`}
          active={filters.maxHours !== DEFAULT_FILTERS.maxHours}
          options={HOUR_OPTIONS.map((h) => ({ label: `${h} hours`, value: h }))}
          onSelect={(v) => onChange({ ...filters, maxHours: v ?? DEFAULT_FILTERS.maxHours })}
        />
        <FilterMenu
          label="Course GPA"
          value={filters.minGpa != null ? `${filters.minGpa.toFixed(1)}+` : "Any"}
          active={filters.minGpa != null}
          options={GPA_OPTIONS.map((g) => ({ label: `${g.toFixed(1)} or higher`, value: g }))}
          anyLabel="Any GPA"
          onSelect={(v) => onChange({ ...filters, minGpa: v })}
        />
        <FilterMenu
          label="Course rating"
          value={filters.minRating != null ? `${filters.minRating.toFixed(1)}+` : "Any"}
          active={filters.minRating != null}
          options={RATING_OPTIONS.map((g) => ({ label: `${g.toFixed(1)} or higher`, value: g }))}
          anyLabel="Any rating"
          onSelect={(v) => onChange({ ...filters, minRating: v })}
        />
        <FilterMenu
          label="RateMyProfessors"
          value={filters.minRmp != null ? `${filters.minRmp.toFixed(1)}+` : "Any"}
          active={filters.minRmp != null}
          options={RATING_OPTIONS.map((g) => ({ label: `${g.toFixed(1)} or higher`, value: g }))}
          anyLabel="Any RMP"
          onSelect={(v) => onChange({ ...filters, minRmp: v })}
        />
        {!isDefault && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => onChange(DEFAULT_FILTERS)}>
            Reset
          </Button>
        )}
        {applying && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label="Updating plan" />}
      </div>
      {strict && (
        <p className="text-xs text-muted-foreground">
          Courses without that data are hidden too. Required courses your audit names are always kept
        </p>
      )}
    </section>
  );
}

function FilterMenu({
  label,
  value,
  active,
  options,
  anyLabel,
  onSelect,
}: {
  label: string;
  value: string;
  active: boolean;
  options: { label: string; value: number }[];
  anyLabel?: string;
  onSelect: (v: number | null) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs transition-colors hover:bg-muted",
          active && "border-texas/40 text-texas",
        )}
      >
        <span className={cn(!active && "text-muted-foreground")}>{label}</span>
        <span className="font-mono tabular-nums">{value}</span>
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {anyLabel && <DropdownMenuItem onClick={() => onSelect(null)}>{anyLabel}</DropdownMenuItem>}
        {options.map((o) => (
          <DropdownMenuItem key={o.value} onClick={() => onSelect(o.value)}>
            {o.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-base font-medium">{children}</h3>;
}

function PrereqLabel({ s }: { s: AuditSuggestion }) {
  if (s.prereq === "met") {
    return (
      <span title="Prerequisites met" className="flex justify-end text-muted-foreground">
        <Check className="h-3.5 w-3.5" aria-label="Prerequisites met" />
      </span>
    );
  }
  return (
    <span
      title={s.prereqNote || undefined}
      className={cn(
        "truncate text-right text-xs",
        s.prereq === "not_met" ? "text-destructive" : "text-amber-600 dark:text-amber-400",
      )}
    >
      {s.prereq === "not_met" ? s.prereqNote.replace(/\.$/, "") || "Prereqs not met" : "Check prereqs"}
    </span>
  );
}

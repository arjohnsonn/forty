"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, GraduationCap, Loader2, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
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
import { CourseDialog } from "@/components/CourseChips";
import { useToast } from "@/components/hooks/use-toast";
import { createClient } from "@/utils/supabase/client";
import { fetchCourseDetail, type BrowseCourse } from "@/lib/browse";
import { courseMeta, type RetrievedSection } from "@/lib/courses";
import { CURRENT_TERM } from "@/lib/term";
import {
  BUILD_HANDOFF_KEY,
  normalizeCode,
  openRequirements,
  parseAudit,
  type AuditResult,
  type AuditSuggestion,
  type ParsedAudit,
  type PrereqStatus,
} from "@/lib/audit";
import { analyzeAudit } from "@/lib/degree-plan";
import { cn } from "@/lib/utils";

type Saved = { audit: ParsedAudit; result: AuditResult; updated_at: string };

const PREREQ_LABEL: Record<PrereqStatus, string> = {
  met: "Prereqs met",
  not_met: "Prereqs not met",
  unclear: "Check prereqs",
};

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

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("degree_audits")
        .select("audit, result, updated_at")
        .maybeSingle();
      if (error) toast({ variant: "destructive", title: "Couldn't load your saved degree plan" });
      setSaved((data as Saved | null) ?? null);
      setLoading(false);
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
      const result = await analyzeAudit(supabase, audit);
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

  const deleteAudit = async () => {
    setConfirmDelete(false);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const { error } = session
      ? await supabase.from("degree_audits").delete().eq("user_id", session.user.id)
      : { error: new Error("signed out") };
    if (error) {
      toast({ variant: "destructive", title: "Couldn't delete your degree plan" });
      return;
    }
    setSaved(null);
    toast({ title: "Degree plan deleted" });
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
          <h2 className="shrink-0 text-lg font-medium text-foreground">Degree plan</h2>
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
                  aria-label="Delete degree plan"
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
              canBuild={(codes) => codes.some((c) => suggestionByCode.has(c))}
              onUpdate={() => setImporting(true)}
            />
          ) : null}
        </div>
      </div>

      <CourseDialog section={detail} loading={!!openCourse && !detail} onClose={closeDetail} />

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete degree plan?</DialogTitle>
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

function Results({
  saved,
  hideUnmet,
  setHideUnmet,
  onOpen,
  onBuild,
  canBuild,
  onUpdate,
}: {
  saved: Saved;
  hideUnmet: boolean;
  setHideUnmet: (v: boolean) => void;
  onOpen: (s: AuditSuggestion) => void;
  onBuild: (codes: string[]) => void;
  canBuild: (codes: string[]) => boolean;
  onUpdate: () => void;
}) {
  const { audit, result } = saved;
  const open = openRequirements(audit);
  const planById = new Map(result.requirements.map((r) => [r.id, r]));
  const completed = audit.requirements.filter((r) => r.status === "completed").length;
  const pct =
    audit.hoursCompleted != null && audit.hoursRequired
      ? Math.min(100, Math.round((audit.hoursCompleted / audit.hoursRequired) * 100))
      : null;

  return (
    <div className="space-y-8">
      {result.term !== CURRENT_TERM && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          <span>This plan was made for {result.term}. Update your audit for {CURRENT_TERM} suggestions.</span>
          <Button size="sm" variant="outline" onClick={onUpdate}>
            Update
          </Button>
        </div>
      )}

      <section className="space-y-2">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-muted-foreground">
            {open.length} requirement{open.length === 1 ? "" : "s"} left · {completed} complete
          </span>
          {pct != null && (
            <span className="font-mono text-xs text-muted-foreground">
              {audit.hoursCompleted}/{audit.hoursRequired} hours
            </span>
          )}
        </div>
        {pct != null && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-texas" style={{ width: `${pct}%` }} />
          </div>
        )}
      </section>

      {result.plan.length > 0 && (
        <section className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <GraduationCap className="h-4 w-4 text-texas" />
            Path to graduation
          </h3>
          <div className="space-y-2">
            {result.plan.map((t) => {
              const codes = t.courses.map((c) => c.code);
              const hours = codes.reduce((n, c) => n + (courseMeta(c)?.credits ?? 0), 0);
              const current = t.term === CURRENT_TERM;
              return (
                <div key={t.term} className={cn("rounded-lg border p-3", current && "border-texas/40")}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-sm font-medium">{t.term}</span>
                    <span className="font-mono text-xs text-muted-foreground">{hours} hrs</span>
                    {current && canBuild(codes) && (
                      <Button size="sm" variant="outline" className="ml-auto h-7" onClick={() => onBuild(codes)}>
                        <CalendarPlus className="mr-1.5 h-3.5 w-3.5" />
                        Build this schedule
                      </Button>
                    )}
                  </div>
                  <ul className="space-y-1">
                    {t.courses.map((c) => (
                      <li key={c.code} className="flex flex-wrap items-center gap-x-2 text-sm">
                        <span className="font-mono">{c.code}</span>
                        {c.warning && (
                          <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                            <TriangleAlert className="h-3 w-3" />
                            {c.warning}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
          {result.notes.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {result.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            Built from your audit, catalog prerequisites, and past offering patterns. Confirm with your advisor before registering.
          </p>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium">What&apos;s left</h3>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <Checkbox checked={hideUnmet} onCheckedChange={(v) => setHideUnmet(v === true)} />
            Hide courses with unmet prerequisites
          </label>
        </div>
        {open.length === 0 && (
          <p className="text-sm text-muted-foreground">Every requirement on your audit is complete or in progress.</p>
        )}
        {open.map((r) => {
          const plan = planById.get(r.id);
          const suggestions = (plan?.suggestions ?? []).filter((s) => !hideUnmet || s.prereq !== "not_met");
          const hidden = (plan?.suggestions.length ?? 0) - suggestions.length;
          return (
            <div key={r.id} className="rounded-lg border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="text-xs text-muted-foreground">{r.section}</p>
                  <p className="text-sm">{r.text}</p>
                  {plan?.note && <p className="text-sm text-muted-foreground">{plan.note}</p>}
                </div>
                {r.lacking && (
                  <Badge variant="outline" className="shrink-0 font-mono font-normal">
                    {r.lacking} left
                  </Badge>
                )}
              </div>
              {suggestions.length > 0 && (
                <ul className="mt-3 divide-y border-t">
                  {suggestions.map((s) => (
                    <li key={s.courseId}>
                      <button
                        type="button"
                        onClick={() => onOpen(s)}
                        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 py-2 text-left text-sm hover:bg-muted/50"
                      >
                        <span className="font-mono font-medium">{s.courseCode}</span>
                        <span className="min-w-0 flex-1 truncate text-muted-foreground">
                          {s.courseHeader.slice((s.courseCode ?? "").length).trim()}
                        </span>
                        {s.gpa != null && <span className="font-mono text-xs text-muted-foreground">{s.gpa.toFixed(2)} GPA</span>}
                        {s.cesRating != null && (
                          <span className="font-mono text-xs text-muted-foreground">{s.cesRating.toFixed(1)}/5</span>
                        )}
                        <span
                          title={s.prereqNote || undefined}
                          className={cn(
                            "text-xs",
                            s.prereq === "met" && "text-emerald-600 dark:text-emerald-400",
                            s.prereq === "not_met" && "text-destructive",
                            s.prereq === "unclear" && "text-amber-600 dark:text-amber-400",
                          )}
                        >
                          {PREREQ_LABEL[s.prereq]}
                        </span>
                        {s.topicRepeat && (
                          <span className="w-full text-xs text-muted-foreground">
                            You&apos;ve taken a {s.courseCode} topic before. Pick a different topic.
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {hidden > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {hidden} course{hidden === 1 ? "" : "s"} hidden for unmet prerequisites.
                </p>
              )}
              {plan?.notOffered.map((n) => (
                <p key={n.code} className="mt-2 text-xs text-muted-foreground">
                  <span className="font-mono">{n.code}</span> isn&apos;t offered in {CURRENT_TERM}
                  {n.seasons.length ? ` (usually ${n.seasons.join(" and ")})` : ""}.
                </p>
              ))}
              {plan && !plan.suggestions.length && !plan.notOffered.length && plan.kind !== "hours" && plan.kind !== "other" && (
                <p className="mt-2 text-xs text-muted-foreground">No matching {CURRENT_TERM} courses found.</p>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}

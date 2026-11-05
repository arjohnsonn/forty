import type { SupabaseClient } from "@supabase/supabase-js";
import { computeGpa, courseMeta } from "@/lib/courses";
import { CURRENT_TERM } from "@/lib/term";
import {
  normalizeCode,
  openRequirements,
  type AuditResult,
  type AuditSuggestion,
  type ParsedAudit,
  type PlanTerm,
  type RequirementPlan,
} from "@/lib/audit";
import { requirementRule, type Rule } from "@/lib/requirements";
import { checkPrereq, parsePrereq, type ParsedPrereq } from "@/lib/prereqs";

const SUGGESTIONS = 8;
const MAX_TERMS = 8;
const TERM_CAP = 16;

type CandidateRow = {
  course_id: number;
  course_header: string;
  course_code: string | null;
  description: string | null;
  num_sections: number;
  instructors: string[] | null;
  instruction_modes: string[] | null;
  core_curriculum: string[] | null;
  grade_data: Record<string, number> | null;
  ces_rating: number | null;
  rmp_rating: number | null;
  seasons: string[] | null;
};

type CourseInfo = { offeredNow: boolean; seasons: string[]; prereq: ParsedPrereq | null; score: number };

const scoreOf = (r: CandidateRow) =>
  (computeGpa(r.grade_data) ?? 3) + 0.4 * (r.ces_rating ?? 4) + 0.2 * (r.rmp_rating ?? 3.5);
const hoursOf = (code: string) => courseMeta(code)?.credits ?? 3;
const codeOf = (r: CandidateRow) => (r.course_code ? normalizeCode(r.course_code) : null);

function termsFrom(start: string, n: number): string[] {
  const [season, yearRaw] = start.split(" ");
  let year = Number(yearRaw);
  let next = season === "Fall" ? "Spring" : "Fall";
  const out = [start];
  while (out.length < n) {
    if (next === "Spring") year += 1;
    out.push(`${next} ${year}`);
    next = next === "Fall" ? "Spring" : "Fall";
  }
  return out;
}

async function fetchCandidates(supabase: SupabaseClient, rule: Rule): Promise<CandidateRow[]> {
  const codes = rule.groups.flat();
  const pool = rule.kind === "pool" && (rule.subjects.length > 0 || !!rule.core);
  if (!codes.length && !pool) return [];
  const { data, error } = await supabase.rpc("audit_candidates", {
    p_codes: codes.length ? codes : null,
    p_subjects: pool && rule.subjects.length ? rule.subjects : null,
    p_level: pool && rule.level !== "any" ? rule.level : null,
    p_core: pool && rule.core ? rule.core : null,
    p_limit: 400,
  });
  if (error) throw error;
  return (data ?? []) as CandidateRow[];
}

export async function analyzeAudit(supabase: SupabaseClient, audit: ParsedAudit): Promise<AuditResult> {
  const taken = new Set(audit.taken);
  const open = openRequirements(audit);
  const rules = open.map((r) => requirementRule(r, taken));
  const rowsPerRule = await Promise.all(rules.map((r) => fetchCandidates(supabase, r)));

  const courses = new Map<string, CourseInfo>();
  for (const r of rowsPerRule.flat()) {
    const code = codeOf(r);
    if (!code) continue;
    const s = scoreOf(r);
    const prev = courses.get(code);
    if (!prev || s > prev.score)
      courses.set(code, { offeredNow: true, seasons: r.seasons ?? [], prereq: parsePrereq(r.description), score: s });
  }

  const missing = Array.from(new Set(rules.flatMap((r) => r.groups.flat()))).filter((c) => !courses.has(c) && !taken.has(c));
  if (missing.length) {
    const { data, error } = await supabase.rpc("course_seasons", { p_codes: missing });
    if (error) throw error;
    for (const h of (data ?? []) as { course_code: string; seasons: string[] | null; description: string | null }[]) {
      const code = normalizeCode(h.course_code);
      if (code) courses.set(code, { offeredNow: false, seasons: h.seasons ?? [], prereq: parsePrereq(h.description), score: 0 });
    }
  }

  const prereqNow = (code: string) => checkPrereq(courses.get(code)?.prereq ?? null, taken, audit.hoursCompleted);

  const requirements: RequirementPlan[] = rules.map((rule, i) => {
    const rows = rowsPerRule[i]!;
    const titles = new Map<string, Set<string>>();
    for (const r of rows) {
      const code = codeOf(r);
      if (code) (titles.get(code) ?? titles.set(code, new Set()).get(code)!).add(r.course_header);
    }
    const exclude = new Set(rule.exclude);
    const suggestions = rows
      .filter((r) => {
        const code = codeOf(r);
        return !!code && !exclude.has(code) && (!taken.has(code) || (titles.get(code)?.size ?? 0) > 1);
      })
      .sort((a, b) => scoreOf(b) - scoreOf(a))
      .map((r): AuditSuggestion => {
        const code = codeOf(r)!;
        const p = prereqNow(code);
        return {
          courseId: r.course_id,
          courseHeader: r.course_header,
          courseCode: r.course_code,
          numSections: r.num_sections,
          instructors: r.instructors ?? [],
          instructionModes: r.instruction_modes ?? [],
          coreCurriculum: r.core_curriculum ?? [],
          gpa: computeGpa(r.grade_data),
          cesRating: r.ces_rating,
          rmpRating: r.rmp_rating,
          seasons: r.seasons ?? [],
          prereq: p.status,
          prereqNote: p.note,
          topicRepeat: taken.has(code),
        };
      })
      .sort((a, b) => Number(a.prereq === "not_met") - Number(b.prereq === "not_met"))
      .slice(0, SUGGESTIONS);
    return {
      id: rule.id,
      kind: rule.kind,
      note: rule.note,
      needed: rule.needed,
      suggestions,
      notOffered: rule.groups
        .flat()
        .filter((c) => courses.get(c)?.offeredNow === false)
        .map((code) => ({ code, seasons: courses.get(code)?.seasons ?? [] })),
    };
  });

  const selected: string[] = [];
  const reqOf = new Map<string, string>();
  const viable = (code: string) => {
    const c = courses.get(code);
    if (!c || (!c.offeredNow && !c.seasons.length)) return false;
    return checkPrereq(c.prereq, new Set(Array.from(taken).concat(selected)), audit.hoursRequired).status !== "not_met";
  };
  const pick = (code: string, reqId: string) => {
    if (reqOf.has(code)) return;
    selected.push(code);
    reqOf.set(code, reqId);
  };
  const byScore = (a: string, b: string) => (courses.get(b)?.score ?? 0) - (courses.get(a)?.score ?? 0);
  const order = rules
    .map((rule, i) => ({ rule, plan: requirements[i]! }))
    .sort((a, b) => Number(a.rule.kind !== "courses") - Number(b.rule.kind !== "courses"));

  const filled = new Map<string, number>();
  for (let pass = 0; pass < 2; pass++) {
    for (const { rule, plan } of order) {
      let count = filled.get(rule.id) ?? 0;
      if (rule.kind === "courses") {
        for (const group of rule.groups) {
          if (count >= rule.needed) break;
          if (group.some((c) => reqOf.get(c) === rule.id)) continue;
          const choice = group.find(viable);
          if (choice) {
            pick(choice, rule.id);
            count++;
          }
        }
      } else if (rule.kind === "pool") {
        for (const s of plan.suggestions) {
          if (count >= rule.needed) break;
          const code = normalizeCode(s.courseCode ?? "");
          if (!code || reqOf.has(code) || !viable(code)) continue;
          pick(code, rule.id);
          count++;
        }
      }
      filled.set(rule.id, count);
    }
  }

  const notes: string[] = [];
  const remainingHours = Math.max(0, (audit.hoursRequired ?? 0) - (audit.hoursCompleted ?? 0));
  const plannedHours = () => selected.reduce((n, c) => n + hoursOf(c), 0);
  const electives = requirements
    .filter((r) => r.kind === "pool")
    .flatMap((r) => r.suggestions.map((s) => ({ code: normalizeCode(s.courseCode ?? ""), reqId: r.id })))
    .filter((e): e is { code: string; reqId: string } => !!e.code)
    .sort((a, b) => byScore(a.code, b.code));
  for (const e of electives) {
    if (plannedHours() >= remainingHours) break;
    if (!reqOf.has(e.code) && viable(e.code)) pick(e.code, e.reqId);
  }
  if (plannedHours() < remainingHours) {
    notes.push(`This plan covers ${plannedHours()} of your ${remainingHours} remaining hours. Add electives to reach ${audit.hoursRequired}.`);
  }

  const terms = termsFrom(CURRENT_TERM, MAX_TERMS);
  const termOf = new Map<string, number>();
  const plan: PlanTerm[] = terms.map((term) => ({ term, courses: [] }));
  let doneHours = audit.hoursCompleted ?? 0;
  for (let t = 0; t < terms.length && termOf.size < selected.length; t++) {
    const season = terms[t]!.split(" ")[0]!;
    const have = new Set(
      Array.from(taken).concat(
        Array.from(termOf)
          .filter(([, i]) => i < t)
          .map(([c]) => c),
      ),
    );
    let load = 0;
    for (const code of selected) {
      if (termOf.has(code)) continue;
      const c = courses.get(code)!;
      const offered = t === 0 ? c.offeredNow : !c.seasons.length || c.seasons.includes(season);
      if (!offered) continue;
      const p = checkPrereq(c.prereq, have, doneHours);
      if (p.status === "not_met" || load + hoursOf(code) > TERM_CAP) continue;
      termOf.set(code, t);
      load += hoursOf(code);
      plan[t]!.courses.push({
        code,
        requirementId: reqOf.get(code) ?? "",
        warning: !c.seasons.length && t > 0 ? "No offering history" : p.status === "unclear" ? "Check prerequisites" : "",
      });
    }
    doneHours += load;
  }

  for (const code of selected) {
    const t = termOf.get(code);
    if (t == null) {
      notes.push(`Couldn't fit ${code} in the next ${MAX_TERMS} semesters. Check when it's offered and its prerequisites.`);
      continue;
    }
    for (const group of prereqNow(code).missing) {
      const before = group.find((c) => (termOf.get(c) ?? Infinity) < t);
      if (before) notes.push(`Take ${before} before ${code}.`);
    }
  }
  for (const { rule } of order) {
    if (rule.kind === "courses" && (filled.get(rule.id) ?? 0) < rule.needed) {
      notes.push(`No plannable option for: ${rule.note.replace(/^Take /, "")}`);
    }
  }

  return { term: CURRENT_TERM, requirements, plan: plan.filter((t) => t.courses.length), notes: notes.slice(0, 6) };
}

import subjects from "@/lib/subject-prefixes.json";
import type { AuditRequirement, RequirementKind } from "@/lib/audit";

const NAMES: Record<string, string> = subjects.names;
const NUM = "[A-Z]?\\d{3}[A-Z]{0,2}";
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const titleCase = (name: string) =>
  name
    .split(" ")
    .map((w) => (w === "and" || w === "of" ? w : w[0]!.toUpperCase() + w.slice(1)))
    .join(" ");

const byLength = (a: string, b: string) => b.length - a.length;
const PREFIX_ALT = [...subjects.prefixes].sort(byLength).map(escape).join("|");
const NAME_ALT = Object.keys(NAMES).map(titleCase).sort(byLength).map(escape).join("|");
const TOKEN = new RegExp(
  `(?<![A-Za-z])(${PREFIX_ALT})\\s+(${NUM})(?![\\w])|\\b(${NAME_ALT})\\s+(${NUM})(?![\\w])|(?<![\\w.])(${NUM})(?![\\w.])(?!\\s*(?:hours?|semester|courses?|percent))`,
  "g",
);
const CONNECTOR = /^[\s,;:/()]*(?:(?:and\/or|or|and)\b[\s,;:/()]*)*$/i;

export const CORE_AREAS: Record<string, string> = {
  "010": "Communication",
  "020": "Mathematics",
  "030": "Natural Science and Technology, Part I",
  "031": "Natural Science and Technology, Part II",
  "093": "Natural Science and Technology, Part II",
  "040": "Humanities",
  "050": "Visual and Performing Arts",
  "060": "U.S. History",
  "070": "American and Texas Government",
  "080": "Social and Behavioral Sciences",
  "090": "First-Year Signature Course",
};

export function subjectPrefix(name: string): string | null {
  const key = name.trim().toLowerCase().replace(/\s+/g, " ");
  return NAMES[key] ?? NAMES[key.replace(/s$/, "")] ?? null;
}

type Item = { code: string; gap: string };

function tokenize(text: string): Item[][] {
  const runs: Item[][] = [];
  let run: Item[] = [];
  let lastPrefix: string | null = null;
  let lastEnd = 0;
  for (const m of Array.from(text.matchAll(TOKEN))) {
    const gap = text.slice(lastEnd, m.index);
    const connected = run.length > 0 && CONNECTOR.test(gap);
    let code: string | null = null;
    if (m[1]) code = `${m[1]} ${m[2]}`;
    else if (m[3]) {
      const prefix = subjectPrefix(m[3]);
      if (prefix) code = `${prefix} ${m[4]}`;
    } else if (m[5] && lastPrefix && connected) code = `${lastPrefix} ${m[5]}`;
    if (!code) continue;
    lastPrefix = code.slice(0, code.lastIndexOf(" "));
    if (!connected && run.length) {
      runs.push(run);
      run = [];
    }
    run.push({ code, gap: connected ? gap : "" });
    lastEnd = (m.index ?? 0) + m[0].length;
  }
  if (run.length) runs.push(run);
  return runs;
}

function groupRun(run: Item[]): string[][] {
  const primaries: { codes: string[]; connector: string }[] = [];
  let inParenOr = false;
  for (const item of run) {
    const gap = item.gap.toLowerCase();
    if (inParenOr && gap.includes(")")) inParenOr = false;
    if (primaries.length && (inParenOr || /\(\s*or\s*$/.test(gap))) {
      inParenOr = true;
      primaries[primaries.length - 1]!.codes.push(item.code);
      continue;
    }
    primaries.push({ codes: [item.code], connector: gap.replace(/[()]/g, "").trim() });
  }

  const groups: string[][] = [];
  let chunk: typeof primaries = [];
  const flush = () => {
    if (!chunk.length) return;
    const inner = chunk.slice(1).map((p) => p.connector);
    const hasOr = inner.some((c) => /\bor\b/.test(c));
    const listForm = hasOr && inner.slice(0, -1).every((c) => c === ",") && /\bor\b/.test(inner[inner.length - 1]!);
    if (listForm || (hasOr && inner.every((c) => /\bor\b/.test(c)))) groups.push(chunk.flatMap((p) => p.codes));
    else {
      let cur: string[] = [];
      chunk.forEach((p, i) => {
        if (i > 0 && !/\bor\b/.test(p.connector)) {
          groups.push(cur);
          cur = [];
        }
        cur.push(...p.codes);
      });
      groups.push(cur);
    }
    chunk = [];
  };
  for (const p of primaries) {
    if (chunk.length && /\band\b/.test(p.connector)) flush();
    chunk.push(p);
  }
  flush();
  return groups.map((g) => Array.from(new Set(g)));
}

export function courseGroups(text: string): string[][] {
  return tokenize(text).flatMap(groupRun);
}

function poolSubject(text: string): { subject: string; level: "upper" | "lower" | "any" } | null {
  const division = text.match(
    /\b(upper|lower)[- ]division\s+(?:coursework\s+|courses?\s+)?(?:in\s+|from\s+)?(?:the\s+)?([a-z][a-z &'-]*?)(?=\s*(?:[,.;:)]|$|\s+excluding\b|\s+courses?\b|\s+coursework\b|\s+must\b|\s+is\b|\s+are\b))/i,
  );
  if (division?.[2]) {
    const subject = subjectPrefix(division[2]);
    if (subject) return { subject, level: division[1]!.toLowerCase() as "upper" | "lower" };
  }
  const coursework = text.match(/\b(?:coursework|courses)\s+in\s+([a-z][a-z &'-]*?)(?=\s*(?:[,.;:)]|$))/i);
  const subject = coursework?.[1] ? subjectPrefix(coursework[1]) : null;
  return subject ? { subject, level: "any" } : null;
}

export type Rule = {
  id: string;
  kind: RequirementKind;
  groups: string[][];
  subjects: string[];
  level: "upper" | "lower" | "any";
  core: string;
  exclude: string[];
  needed: number;
  note: string;
};

function neededCount(lacking: string): number {
  const m = lacking.match(/(\d+(?:\.\d+)?)\s+(hours?|courses?)/i);
  if (!m) return 1;
  const n = Number(m[1]);
  return Math.max(1, /course/i.test(m[2]!) ? Math.round(n) : Math.ceil(n / 3));
}

const joinGroups = (groups: string[][]) => groups.map((g) => g.join(" or ")).join("; ");

export function requirementRule(req: AuditRequirement, taken: Set<string>): Rule {
  const text = req.text;
  const rule: Rule = {
    id: req.id,
    kind: "other",
    groups: [],
    subjects: [],
    level: "any",
    core: "",
    exclude: [],
    needed: neededCount(req.lacking),
    note: "",
  };

  if (/\bGPA\b|grade point average/i.test(text)) return rule;
  if (/\bin[- ]residence\b/i.test(text)) return { ...rule, kind: "hours", note: "Any UT course you take counts toward this." };
  if (/writing[- ]intensive|writing flag/i.test(text))
    return { ...rule, note: "Take a course with the Writing flag. Check flags in the course schedule." };

  const excluding = text.match(/\bexcluding\s+([^.;]*)/i);
  const body = excluding ? text.replace(excluding[0], "") : text;
  const pool = poolSubject(body);
  const core = CORE_AREAS[text.match(/\bCORE \((\d{3})/)?.[1] ?? ""] ?? "";
  const groups = courseGroups(body).filter((g) => !g.some((c) => taken.has(c)));

  if (pool) {
    const exclude = excluding
      ? courseGroups(`${pool.subject} ${excluding[1]!.replace(/\band\b/g, ",")}`).flat()
      : [];
    const where = `${pool.level === "any" ? "" : `${pool.level}-division `}${pool.subject}`;
    return {
      ...rule,
      kind: "pool",
      groups,
      subjects: [pool.subject],
      level: pool.level,
      exclude,
      note: `Any ${where} course${groups.length ? `, or ${joinGroups(groups)}` : ""}${exclude.length ? ` (not ${exclude.join(", ")})` : ""}.`,
    };
  }
  if (core) {
    return { ...rule, kind: "pool", groups, core, note: `Any ${core} core course${groups.length ? `, such as ${joinGroups(groups)}` : ""}.` };
  }
  if (groups.length) {
    const needed = Math.min(groups.length, rule.needed);
    return {
      ...rule,
      kind: "courses",
      groups,
      needed,
      note: needed < groups.length ? `Take ${needed} of: ${joinGroups(groups)}.` : `Take ${joinGroups(groups)}.`,
    };
  }
  if (/\bhours?\b/i.test(text)) return { ...rule, kind: "hours", note: "Any course you take counts toward this." };
  return rule;
}

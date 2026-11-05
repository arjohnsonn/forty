export const BUILD_HANDOFF_KEY = "forty:build-handoff";

export type AuditStatus = "completed" | "partial" | "missing" | "info";

export type AuditRequirement = {
  id: string;
  section: string;
  text: string;
  status: AuditStatus;
  required: string;
  counted: string;
  lacking: string;
  courses: string[];
};

export type ParsedAudit = {
  program: string;
  catalog: string;
  credentials: string[];
  hoursCompleted: number | null;
  hoursRequired: number | null;
  requirements: AuditRequirement[];
  taken: string[];
  unused: string[];
};

export type PrereqStatus = "met" | "not_met" | "unclear";

export type AuditSuggestion = {
  courseId: number;
  courseHeader: string;
  courseCode: string | null;
  numSections: number;
  instructors: string[];
  instructionModes: string[];
  coreCurriculum: string[];
  gpa: number | null;
  cesRating: number | null;
  rmpRating: number | null;
  seasons: string[];
  prereq: PrereqStatus;
  prereqNote: string;
  topicRepeat: boolean;
};

export type RequirementKind = "courses" | "pool" | "hours" | "other";

export type RequirementPlan = {
  id: string;
  kind: RequirementKind;
  note: string;
  needed: number;
  suggestions: AuditSuggestion[];
  notOffered: { code: string; seasons: string[] }[];
};

export type PlanCourse = { code: string; requirementId: string; warning: string };
export type PlanTerm = { term: string; courses: PlanCourse[] };

export type AuditResult = {
  term: string;
  requirements: RequirementPlan[];
  plan: PlanTerm[];
  notes: string[];
};

const STATUS: Record<string, AuditStatus> = {
  completed: "completed",
  "partially completed": "partial",
  "not completed": "missing",
};

const CODE = /^([A-Z][A-Z ]{0,5}?)\s+([A-Z]?\d{3}[A-Z]{0,2})$/;

export function normalizeCode(raw: string): string | null {
  const m = raw.trim().toUpperCase().replace(/\s+/g, " ").match(CODE);
  return m ? `${m[1]!.trim()} ${m[2]}` : null;
}

const cells = (line: string) => (line.includes("\t") ? line.split("\t") : line.split(/\s{2,}/)).map((c) => c.trim());

const hours = (v: string) => {
  const m = v.match(/^(\d+(?:\.\d+)?)\s+hours?$/i);
  return m ? Number(m[1]) : null;
};

export function parseAudit(text: string): ParsedAudit {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+$/, ""));
  const requirements: AuditRequirement[] = [];
  const unused: string[] = [];
  const credentials: string[] = [];
  let program = "";
  let section = "";
  let inUnused = false;
  let hoursCompleted: number | null = null;
  let hoursRequired: number | null = null;

  lines.forEach((line, i) => {
    const t = line.trim();
    if (!t) return;
    if (/^School\/Major:/i.test(t)) program = lines[i + 1]?.trim() ?? "";
    if (/^Credential\s/i.test(t)) credentials.push(t.replace(/^Credential\s+/i, ""));

    const header = t.match(/^(.+?)\s+Show\/Hide$/);
    if (header && !/^\d/.test(t)) {
      section = header[1]!.replace(/\s*\(.*$/, "").trim();
      inUnused = /not counting/i.test(section);
      return;
    }

    const c = cells(line);
    if (inUnused) {
      const code = normalizeCode(c[0] ?? "");
      if (code) unused.push(code);
      return;
    }
    if (!/^\d+$/.test(c[0] ?? "") || c.length < 3) return;

    const [num, done = "", req = "", required = "", counted = "", lacking = "", courses = ""] = c;
    const status = STATUS[done.toLowerCase()] ?? "info";
    const row: AuditRequirement = {
      id: `${section || "General"}#${num}`,
      section: section || "General",
      text: req,
      status,
      required,
      counted,
      lacking,
      courses: courses
        .split(",")
        .map((x) => normalizeCode(x.replace(/\.\.\.$/, "")))
        .filter((x): x is string => !!x),
    };
    requirements.push(row);

    if (/hours are required for the/i.test(req)) {
      hoursRequired = hours(required);
      hoursCompleted = hours(counted);
    }
  });

  if (!requirements.length) {
    throw new Error("That doesn't look like a degree audit. Open your audit in IDA, select all, copy, and paste it here.");
  }

  const taken = Array.from(new Set([...requirements.flatMap((r) => r.courses), ...unused])).sort();
  return {
    program,
    catalog: text.match(/(\d{4}\s*-\s*\d{4})\s+Catalog/)?.[1]?.replace(/\s+/g, "") ?? "",
    credentials,
    hoursCompleted,
    hoursRequired,
    requirements,
    taken,
    unused,
  };
}

export const openRequirements = (audit: ParsedAudit) =>
  audit.requirements.filter((r) => r.status === "missing" || r.status === "partial");

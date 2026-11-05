import { courseGroups, subjectPrefix } from "@/lib/requirements";
import { courseMeta } from "@/lib/courses";
import type { PrereqStatus } from "@/lib/audit";

type Alternative = { groups: string[][]; subject: { prefix: string; hours: number } | null };

export type ParsedPrereq = {
  required: string[][];
  anyOf: Alternative[];
  anyOfOpen: boolean;
  hours: number | null;
  unverifiable: boolean;
};

const ONES: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, eighteen: 18,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

function wordNumber(raw: string): number | null {
  const w = raw.toLowerCase();
  if (/^\d+$/.test(w)) return Number(w);
  const [t, o] = w.split("-");
  if (t && TENS[t] != null) return TENS[t]! + (o ? (ONES[o] ?? NaN) : 0) || null;
  return ONES[w] ?? null;
}

const UNVERIFIABLE = /consent|admission to|approval|restricted to|enrollment in|majors? (?:in|only)|graduate standing|audition|instructor|declared|good standing/i;

function hasUnresolvedNames(text: string): boolean {
  for (const m of Array.from(text.matchAll(/\b([A-Z][a-z]+(?: (?:and )?[A-Z][a-z]+)*) [A-Z]?\d{3}[A-Z]{0,2}\b/g))) {
    if (!subjectPrefix(m[1]!.replace(/^(?:And|Or|For|Credit|Credit For)\s+/i, ""))) return true;
  }
  return false;
}

function alternative(raw: string): Alternative & { raw: string } {
  const m = raw.match(/\b(\d+|[a-z]+(?:-[a-z]+)?)\s+semester hours of ([a-z &'-]+?)\s+coursework\b/i);
  const hours = m ? wordNumber(m[1]!) : null;
  const prefix = m ? subjectPrefix(m[2]!) : null;
  return { raw, groups: courseGroups(raw), subject: hours != null && prefix ? { prefix, hours } : null };
}

export function parsePrereq(description: string | null): ParsedPrereq | null {
  if (description == null) return null;
  const text = description.match(/Prerequisites?:([\s\S]*?)(?:\n\n|$)/i)?.[1]?.trim();
  const empty: ParsedPrereq = { required: [], anyOf: [], anyOfOpen: false, hours: null, unverifiable: false };
  if (!text) return empty;

  const hoursMatch = text.match(/\b(\d+|[a-z]+(?:-[a-z]+)?)\s+semester hours of (?:college |upper-division )?coursework\b/i);
  const anyOfAt = text.search(/\bone of the following\b/i);
  const head = anyOfAt >= 0 ? text.slice(0, anyOfAt) : text;
  const tail = anyOfAt >= 0 ? text.slice(anyOfAt).replace(/^one of the following:?/i, "") : "";

  const alternatives = tail ? tail.split(";").map(alternative) : [];
  return {
    required: head.split(";").flatMap((part) => courseGroups(part)),
    anyOf: alternatives.filter((a) => a.groups.length > 0 || a.subject),
    anyOfOpen: alternatives.some((a) => !a.groups.length && !a.subject && /\w/.test(a.raw)),
    hours: hoursMatch && !tail.includes(hoursMatch[0]) ? wordNumber(hoursMatch[1]!) : null,
    unverifiable: UNVERIFIABLE.test(text) || hasUnresolvedNames(text) || (!!hoursMatch && wordNumber(hoursMatch[1]!) == null),
  };
}

export type PrereqCheck = { status: PrereqStatus; missing: string[][]; note: string };

export function checkPrereq(p: ParsedPrereq | null, have: Set<string>, hours: number | null): PrereqCheck {
  if (!p) return { status: "unclear", missing: [], note: "No catalog prerequisites on file." };
  const unmet = (groups: string[][]) => groups.filter((g) => !g.some((c) => have.has(c)));
  const subjectHours = (prefix: string) =>
    Array.from(have)
      .filter((c) => c.slice(0, c.lastIndexOf(" ")) === prefix)
      .reduce((n, c) => n + (courseMeta(c)?.credits ?? 0), 0);
  const satisfied = (alt: Alternative) =>
    alt.groups.length ? unmet(alt.groups).length === 0 : !!alt.subject && subjectHours(alt.subject.prefix) >= alt.subject.hours;
  const missing = unmet(p.required);
  if (p.anyOf.length && !p.anyOf.some(satisfied)) {
    if (p.anyOfOpen) return { status: "unclear", missing, note: "Check the alternative prerequisites." };
    missing.push(...(p.anyOf.find((a) => a.groups.length)?.groups ?? []));
  }
  if (missing.length) {
    return { status: "not_met", missing, note: `Needs ${missing.map((g) => g.join(" or ")).join(" and ")}.` };
  }
  if (p.hours != null && hours != null && hours < p.hours) {
    return { status: "not_met", missing: [], note: `Needs ${p.hours} completed hours.` };
  }
  if (p.unverifiable || (p.hours != null && hours == null)) {
    return { status: "unclear", missing: [], note: "Has conditions we can't verify, like consent or major." };
  }
  return { status: "met", missing: [], note: "" };
}

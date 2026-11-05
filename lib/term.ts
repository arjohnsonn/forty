export const CURRENT_TERM = "Spring 2027";
export const CURRENT_TERM_CODE = "20272";

const FIRST_FULL_WEEK: Record<string, [number, number, number]> = {
  "Fall 2026": [2026, 7, 31],
  "Spring 2027": [2027, 0, 25],
};

export const isCurrentTerm = (term: string) => term === CURRENT_TERM;

export function firstFullWeek(term: string): Date {
  const [y, m, d] = FIRST_FULL_WEEK[term] ?? FIRST_FULL_WEEK[CURRENT_TERM]!;
  return new Date(y, m, d);
}

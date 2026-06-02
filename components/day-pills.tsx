"use client";

import { cn } from "@/lib/utils";

export const DAYS = [
  { code: "M", label: "M", name: "Monday" },
  { code: "T", label: "T", name: "Tuesday" },
  { code: "W", label: "W", name: "Wednesday" },
  { code: "Th", label: "Th", name: "Thursday" },
  { code: "F", label: "F", name: "Friday" },
  { code: "S", label: "S", name: "Saturday" },
  { code: "Su", label: "Su", name: "Sunday" },
];

// "T,Th" -> ["Tuesday", "Thursday"], for building the natural-language prompt.
export const dayCodesToNames = (csv: string | undefined): string[] =>
  (csv ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((code) => DAYS.find((d) => d.code === code)?.name)
    .filter((n): n is string => !!n);

// Toggleable weekday pills; value is a comma-separated list of selected day codes.
export function DayPills({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const selected = new Set(
    value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const toggle = (code: string) => {
    const next = new Set(selected);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    // Re-emit in canonical order so the value is stable regardless of click order.
    onChange(
      DAYS.filter((d) => next.has(d.code))
        .map((d) => d.code)
        .join(","),
    );
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {DAYS.map((d) => {
        const on = selected.has(d.code);
        return (
          <button
            key={d.code}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(d.code)}
            className={cn(
              "h-9 min-w-9 rounded-full border px-3 text-sm font-medium transition-colors",
              on
                ? "border-texas bg-texas text-white"
                : "border-input text-muted-foreground hover:bg-foreground/5",
            )}
          >
            {d.label}
          </button>
        );
      })}
    </div>
  );
}

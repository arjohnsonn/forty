import { colorAt, minuteLabel } from "@/lib/courses";
import { cn } from "@/lib/utils";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const START = 9 * 60;
const END = 16 * 60;
const HOURS = Array.from({ length: (END - START) / 60 }, (_, i) => START + i * 60);

const COURSES = [
  { code: "C S 314", days: [0, 2], start: 600, end: 690, color: 0 },
  { code: "M 408D", days: [1, 3], start: 660, end: 750, color: 1 },
  { code: "PHY 303K", days: [0, 2], start: 780, end: 870, color: 2 },
  { code: "RHE 306", days: [1, 3], start: 840, end: 930, color: 3 },
];

const pct = (min: number) => `${((min - START) / (END - START)) * 100}%`;

export function LandingPreview() {
  return (
    <div
      aria-hidden
      className="pointer-events-none select-none rounded-2xl border bg-card p-4 shadow-[0_8px_24px_rgba(0,0,0,0.06)] dark:shadow-none sm:p-6"
    >
      <div className="ml-auto max-w-[85%] rounded-2xl bg-muted px-4 py-2.5 text-sm">
        Build me a schedule with C S 314, M 408D, PHY 303K and RHE 306.
        Nothing before 10, Fridays off
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        All four fit Monday to Thursday, earliest start 10:00 AM
      </p>

      <div className="mt-4 rounded-xl border">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">Fall schedule</span>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            13 hours
          </span>
        </div>
        <div className="flex border-b">
          <div className="hidden w-14 shrink-0 sm:block" />
          {DAYS.map((d) => (
            <div key={d} className="flex-1 py-2 text-center text-xs text-muted-foreground">
              {d}
            </div>
          ))}
        </div>
        <div className="flex h-64 sm:h-72">
          <div className="relative hidden w-14 shrink-0 sm:block">
            {HOURS.slice(1).map((h) => (
              <span
                key={h}
                style={{ top: pct(h) }}
                className="absolute right-2 -translate-y-1/2 font-mono text-[11px] tabular-nums text-muted-foreground"
              >
                {minuteLabel(h).replace(":00", "")}
              </span>
            ))}
          </div>
          {DAYS.map((d, day) => (
            <div key={d} className="relative flex-1 border-l first:border-l-0 sm:first:border-l">
              {HOURS.slice(1).map((h) => (
                <div key={h} style={{ top: pct(h) }} className="absolute inset-x-0 border-t border-dashed" />
              ))}
              {COURSES.filter((c) => c.days.includes(day)).map((c) => {
                const color = colorAt(c.color);
                return (
                  <div
                    key={c.code}
                    style={{ top: pct(c.start), height: pct(START + c.end - c.start) }}
                    className={cn(
                      "absolute inset-x-1 overflow-hidden rounded-md px-1.5 py-1 text-[11px] leading-4",
                      color.bg,
                      color.text,
                    )}
                  >
                    <div className="truncate font-mono font-medium">{c.code}</div>
                    <div className="hidden truncate tabular-nums opacity-80 md:block">
                      {minuteLabel(c.start)}
                    </div>
                  </div>
                );
              })}
              {day === 4 && (
                <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-xs text-muted-foreground">
                  Free
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

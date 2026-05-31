"use client";

import { cn } from "@/lib/utils";

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

/** A compact hour / minute / AM-PM picker. Value and onChange are in minutes-from-midnight. */
export default function TimePicker({
  value,
  onChange,
  className,
}: {
  value: number;
  onChange: (min: number) => void;
  className?: string;
}) {
  const h24 = Math.floor(value / 60);
  const minute = value % 60;
  const meridiem = h24 >= 12 ? "PM" : "AM";
  const hour12 = h24 % 12 || 12;

  const emit = (h12: number, m: number, mer: string) => {
    const h = (h12 % 12) + (mer === "PM" ? 12 : 0);
    onChange(h * 60 + m);
  };

  const selectClass =
    "cursor-pointer rounded-md border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <select className={selectClass} value={hour12} onChange={(e) => emit(Number(e.target.value), minute, meridiem)}>
        {HOURS.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <span className="text-muted-foreground">:</span>
      <select className={selectClass} value={minute} onChange={(e) => emit(hour12, Number(e.target.value), meridiem)}>
        {MINUTES.map((m) => (
          <option key={m} value={m}>
            {String(m).padStart(2, "0")}
          </option>
        ))}
      </select>
      <select className={selectClass} value={meridiem} onChange={(e) => emit(hour12, minute, e.target.value)}>
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}

import {
  parseDays,
  parseHourRange,
  minuteLabel,
  assignLanes,
  colorIndexFor,
  courseHexShade,
  type ScheduleSection,
  type TimeBlock,
} from "@/lib/courses";

export type ExportSchedule = { name: string; sections: ScheduleSection[]; blocks: TimeBlock[] };

const slug = (name: string) => name.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "schedule";

function download(content: string | Blob, filename: string, type = "text/plain") {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const DAY_CODES = ["M", "T", "W", "Th", "F", "Sa", "Su"];

export function exportJson(s: ExportSchedule) {
  download(
    JSON.stringify({ name: s.name, sections: s.sections, blocks: s.blocks }, null, 2),
    `${slug(s.name)}.json`,
    "application/json"
  );
}

export function exportTxt(s: ExportSchedule) {
  const lines = [s.name, "=".repeat(s.name.length), ""];
  for (const sec of s.sections) {
    lines.push(`${sec.course_code} ${sec.course_title}`.trim());
    if (sec.instructors.length) lines.push(`  ${sec.instructors.join(", ")}`);
    for (const m of sec.meetings) {
      const r = parseHourRange(m.hours);
      const time = r ? `${minuteLabel(r.startMin)}–${minuteLabel(r.endMin)}` : m.hours || "TBA";
      lines.push(`  ${m.days || "TBA"} ${time}${m.location ? ` · ${m.location}` : ""}`);
    }
    lines.push("");
  }
  if (s.blocks.length) {
    lines.push("Time blocks:");
    for (const b of s.blocks) {
      lines.push(`  ${b.label}: ${b.days.map((d) => DAY_CODES[d]).join("")} ${minuteLabel(b.startMin)}–${minuteLabel(b.endMin)}`);
    }
  }
  download(lines.join("\n"), `${slug(s.name)}.txt`);
}

// --- iCalendar (.ics) --------------------------------------------------------------------------
const pad = (n: number) => String(n).padStart(2, "0");
const escapeIcs = (v: string) => v.replace(/[\\;,]/g, (c) => "\\" + c).replace(/\n/g, "\\n");

export function exportIcs(s: ExportSchedule) {
  // Anchor recurring events to the Monday of a representative Fall 2026 week; floating local time.
  const base = new Date(2026, 7, 31);
  base.setDate(base.getDate() - ((base.getDay() + 6) % 7));
  const dateFor = (dayIdx: number) => {
    const d = new Date(base);
    d.setDate(base.getDate() + dayIdx);
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  };
  const timeFor = (min: number) => `${pad(Math.floor(min / 60))}${pad(min % 60)}00`;

  const events: string[] = [];
  const event = (uid: string, summary: string, location: string, dayIdx: number, startMin: number, endMin: number) =>
    events.push(
      [
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `SUMMARY:${escapeIcs(summary)}`,
        location ? `LOCATION:${escapeIcs(location)}` : "",
        `DTSTART:${dateFor(dayIdx)}T${timeFor(startMin)}`,
        `DTEND:${dateFor(dayIdx)}T${timeFor(endMin)}`,
        "RRULE:FREQ=WEEKLY;COUNT=15",
        "END:VEVENT",
      ]
        .filter(Boolean)
        .join("\r\n")
    );

  for (const sec of s.sections) {
    const summary = `${sec.course_code} ${sec.course_title}`.trim();
    for (const m of sec.meetings) {
      const r = parseHourRange(m.hours);
      const days = parseDays(m.days);
      if (!r || !days.length) continue;
      for (const d of days) event(`${sec.section_id}-${d}@forty`, summary, m.location, d, r.startMin, r.endMin);
    }
  }
  for (const b of s.blocks) for (const d of b.days) event(`${b.id}-${d}@forty`, b.label, "", d, b.startMin, b.endMin);

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Forty//Schedule//EN",
    "CALSCALE:GREGORIAN",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
  download(ics, `${slug(s.name)}.ics`, "text/calendar");
}

// --- PNG (canvas) — mirrors the live WeeklyGrid (theme colors, translucent blocks, lanes) -------
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOUR_H = 56;
const GUTTER = 56;
const COL_W = 132;
const COLS = 7;
const PAD = 16;
const TITLE_H = 30;
const HEADER_H = 34;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

const hexAlpha = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

export function exportPng(s: ExportSchedule) {
  // Resolve the live theme's CSS variables so the export matches whatever theme is active.
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  const dark = root.classList.contains("dark");
  const tok = (name: string, fallback: string, a = 1) => {
    const v = cs.getPropertyValue(name).trim();
    return v ? `hsl(${v} / ${a})` : fallback;
  };
  const C = {
    bg: tok("--background", dark ? "#0a0a0a" : "#ffffff"),
    fg: tok("--foreground", dark ? "#fafafa" : "#0a0a0a"),
    header: tok("--muted", dark ? "rgba(38,38,38,.3)" : "rgba(245,245,245,.3)", 0.3),
    mutedFg: tok("--muted-foreground", dark ? "#a3a3a3" : "#737373"),
    border: tok("--border", dark ? "#262626" : "#e5e5e5"),
    line: tok("--border", dark ? "rgba(38,38,38,.4)" : "rgba(229,229,229,.4)", 0.4),
    blockBg: tok("--muted", dark ? "rgba(38,38,38,.6)" : "rgba(245,245,245,.6)", 0.6),
    blockBorder: tok("--muted-foreground", dark ? "rgba(163,163,163,.3)" : "rgba(115,115,115,.3)", 0.3),
  };

  // Per day: lane out courses + time blocks together (side by side on overlap), like the grid.
  type Placed = { dayIdx: number; startMin: number; endMin: number; lane: number; lanes: number; title: string; sub: string; idx: number | null; conflict: boolean };
  const placed: Placed[] = [];
  for (let d = 0; d < COLS; d++) {
    const courses: { startMin: number; endMin: number; code: string; location: string; idx: number; conflict: boolean }[] = [];
    for (const sec of s.sections) {
      const idx = colorIndexFor(sec);
      for (const m of sec.meetings) {
        const r = parseHourRange(m.hours);
        if (r && parseDays(m.days).includes(d)) courses.push({ startMin: r.startMin, endMin: r.endMin, code: sec.course_code, location: m.location, idx, conflict: false });
      }
    }
    for (let i = 0; i < courses.length; i++)
      courses[i]!.conflict = courses.some((o, j) => j !== i && o.startMin < courses[i]!.endMin && courses[i]!.startMin < o.endMin);
    const blocks = s.blocks.filter((b) => b.days.includes(d)).map((b) => ({ startMin: b.startMin, endMin: b.endMin, label: b.label }));
    const items = [
      ...courses.map((c) => ({ kind: "course" as const, ...c })),
      ...blocks.map((b) => ({ kind: "block" as const, ...b })),
    ];
    for (const it of assignLanes(items)) {
      if (it.kind === "course")
        placed.push({ dayIdx: d, startMin: it.startMin, endMin: it.endMin, lane: it.lane, lanes: it.lanes, title: it.code, sub: it.location, idx: it.idx, conflict: it.conflict });
      else placed.push({ dayIdx: d, startMin: it.startMin, endMin: it.endMin, lane: it.lane, lanes: it.lanes, title: it.label, sub: "", idx: null, conflict: false });
    }
  }

  const starts = placed.map((p) => p.startMin);
  const ends = placed.map((p) => p.endMin);
  const gridStart = Math.floor(Math.min(8 * 60, ...(starts.length ? starts : [8 * 60])) / 60) * 60;
  const gridEnd = Math.ceil(Math.max(18 * 60, ...(ends.length ? ends : [18 * 60])) / 60) * 60;

  const bodyH = ((gridEnd - gridStart) / 60) * HOUR_H;
  const W = PAD * 2 + GUTTER + COLS * COL_W;
  const H = PAD * 2 + TITLE_H + HEADER_H + bodyH;
  const scale = 2;
  const font = "ui-sans-serif, system-ui, sans-serif";

  const canvas = document.createElement("canvas");
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(scale, scale);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = "middle";

  // Title
  ctx.fillStyle = C.fg;
  ctx.font = `600 18px ${font}`;
  ctx.textAlign = "left";
  ctx.fillText(s.name, PAD, PAD + 12);

  const cardX = PAD;
  const cardY = PAD + TITLE_H;
  const cardW = GUTTER + COLS * COL_W;
  const cardH = HEADER_H + bodyH;
  const gx = cardX + GUTTER; // day columns start
  const gy = cardY + HEADER_H; // body top

  // Card outline + header strip
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 1;
  roundRect(ctx, cardX, cardY, cardW, cardH, 8);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = C.header;
  ctx.fillRect(cardX, cardY, cardW, HEADER_H);
  ctx.restore();
  roundRect(ctx, cardX, cardY, cardW, cardH, 8);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cardX, gy);
  ctx.lineTo(cardX + cardW, gy);
  ctx.stroke();

  // Day labels
  ctx.font = `500 12px ${font}`;
  ctx.fillStyle = C.mutedFg;
  ctx.textAlign = "center";
  for (let d = 0; d < COLS; d++) ctx.fillText(DAY_LABELS[d]!, gx + d * COL_W + COL_W / 2, cardY + HEADER_H / 2);

  // Hour lines + gutter labels
  ctx.font = `10px ${font}`;
  for (let h = gridStart / 60; h <= gridEnd / 60; h++) {
    const y = gy + ((h * 60 - gridStart) / 60) * HOUR_H;
    if (h > gridStart / 60) {
      ctx.strokeStyle = C.line;
      ctx.beginPath();
      ctx.moveTo(gx, y);
      ctx.lineTo(gx + COLS * COL_W, y);
      ctx.stroke();
    }
    ctx.fillStyle = C.mutedFg;
    ctx.textAlign = "right";
    if (h > gridStart / 60) ctx.fillText(minuteLabel((h % 24) * 60), gx - 6, y);
  }
  // Column separators
  ctx.strokeStyle = C.line;
  for (let d = 1; d < COLS; d++) {
    const x = gx + d * COL_W;
    ctx.beginPath();
    ctx.moveTo(x, gy);
    ctx.lineTo(x, gy + bodyH);
    ctx.stroke();
  }

  // Blocks
  ctx.textAlign = "left";
  for (const it of placed) {
    const laneW = COL_W / it.lanes;
    const x = gx + it.dayIdx * COL_W + it.lane * laneW + 2;
    const y = gy + ((it.startMin - gridStart) / 60) * HOUR_H + 1;
    const w = laneW - 4;
    const h = Math.max(((it.endMin - it.startMin) / 60) * HOUR_H - 2, 16);
    const isBlock = it.idx == null;
    const base = isBlock ? null : courseHexShade(it.idx!, 500);
    const text = isBlock ? C.mutedFg : courseHexShade(it.idx!, dark ? 300 : 700);

    roundRect(ctx, x, y, w, h, 6);
    ctx.fillStyle = isBlock ? C.blockBg : hexAlpha(base!, 0.4);
    ctx.fill();
    if (isBlock) {
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = C.blockBorder;
      ctx.lineWidth = 1;
      roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 6);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (it.conflict) {
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 2;
      roundRect(ctx, x + 1, y + 1, w - 2, h - 2, 6);
      ctx.stroke();
    }

    ctx.fillStyle = text;
    ctx.font = `600 11px ${font}`;
    ctx.fillText(it.title, x + 6, y + 11, w - 10);
    if (h > 26) {
      ctx.font = `10px ${font}`;
      ctx.fillStyle = isBlock ? C.mutedFg : hexAlpha(courseHexShade(it.idx!, dark ? 300 : 700), 0.8);
      ctx.fillText(`${minuteLabel(it.startMin)}–${minuteLabel(it.endMin)}`, x + 6, y + 25, w - 10);
    }
    if (it.sub && h > 40) {
      ctx.fillStyle = C.mutedFg;
      ctx.fillText(it.sub, x + 6, y + 39, w - 10);
    }
  }

  canvas.toBlob((blob) => {
    if (blob) download(blob, `${slug(s.name)}.png`, "image/png");
  }, "image/png");
}

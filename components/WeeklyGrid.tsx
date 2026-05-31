"use client";

import { useEffect, useRef, useState } from "react";
import { X, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/utils/supabase/client";
import {
  parseDays,
  parseHourRange,
  courseColor,
  colorAt,
  minuteLabel,
  scheduleSectionToRetrieved,
  type ScheduleSection,
  type CourseColor,
  type RetrievedSection,
  type TimeBlock,
} from "@/lib/courses";
import { CourseDialog } from "@/components/CourseChips";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOUR_PX = 56;
const DAY_MIN = 1440; // full 24 hours
const SNAP = 15;
const FOCUS_MIN = 8 * 60; // scroll so ~8 AM sits at the top (9–6 comfortably in view)

const sectionColor = (s: ScheduleSection): CourseColor =>
  s.color != null ? colorAt(s.color) : courseColor(s.course_code);

type Block = {
  sectionId: number;
  code: string;
  location: string;
  dayIdx: number;
  startMin: number;
  endMin: number;
  color: CourseColor;
  lane: number;
  lanes: number;
  conflict: boolean;
  source: ScheduleSection;
};

type BlockInstance = { block: TimeBlock; dayIdx: number };

// Side-by-side lanes for time-ranged items (courses + time blocks share a day's width, GCal-style).
function assignLanes<T extends { startMin: number; endMin: number }>(
  items: T[]
): Array<T & { lane: number; lanes: number }> {
  const sorted = items
    .slice()
    .sort((a, z) => a.startMin - z.startMin || a.endMin - z.endMin)
    .map((x) => ({ ...x, lane: 0, lanes: 1 }));
  let i = 0;
  while (i < sorted.length) {
    let end = i + 1;
    let maxEnd = sorted[i]!.endMin;
    while (end < sorted.length && sorted[end]!.startMin < maxEnd) {
      maxEnd = Math.max(maxEnd, sorted[end]!.endMin);
      end++;
    }
    const cluster = sorted.slice(i, end);
    const laneEnds: number[] = [];
    for (const b of cluster) {
      let lane = laneEnds.findIndex((e) => e <= b.startMin);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(b.endMin);
      } else {
        laneEnds[lane] = b.endMin;
      }
      b.lane = lane;
    }
    for (const b of cluster) b.lanes = laneEnds.length;
    i = end;
  }
  return sorted;
}

export default function WeeklyGrid({
  sections,
  timeBlocks,
  onRemove,
  onRemoveBlock,
  onUpdateBlock,
  onRequestCreate,
  onRequestEdit,
}: {
  sections: ScheduleSection[];
  timeBlocks: TimeBlock[];
  onRemove: (sectionId: number) => void;
  onRemoveBlock: (blockId: string) => void;
  onUpdateBlock: (block: TimeBlock) => void;
  onRequestCreate: (draft: { days: number[]; startMin: number; endMin: number }) => void;
  onRequestEdit: (block: TimeBlock) => void;
}) {
  const [supabase] = useState(() => createClient());
  const [selected, setSelected] = useState<RetrievedSection | null>(null);
  const openHeader = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const columnsRef = useRef<HTMLDivElement | null>(null);
  const dragCleanup = useRef<(() => void) | null>(null);

  // Attach window drag listeners + register cleanup so they can't leak on mid-drag unmount.
  const beginDrag = (onMove: (e: PointerEvent) => void, onUp: (e: PointerEvent) => void) => {
    const up = (e: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", up);
      dragCleanup.current = null;
      onUp(e);
    };
    dragCleanup.current = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", up);
      dragCleanup.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", up);
  };

  // Drag previews: creating a new block, or moving/resizing an existing one (days may change).
  const [preview, setPreview] = useState<{ dayIdx: number; startMin: number; endMin: number } | null>(null);
  const [movePreview, setMovePreview] = useState<{
    id: string;
    label: string;
    days: number[];
    startMin: number;
    endMin: number;
  } | null>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = (FOCUS_MIN / 60) * HOUR_PX;
  }, []);

  useEffect(() => () => dragCleanup.current?.(), []);

  const openCourse = async (s: ScheduleSection) => {
    const base = s.detail ?? scheduleSectionToRetrieved(s);
    openHeader.current = base.course_header;
    setSelected(base);
    if (base.description) return;
    const { data } = await supabase
      .from("courses")
      .select("description")
      .eq("course_header", base.course_header)
      .maybeSingle();
    const description = (data as { description: string | null } | null)?.description;
    if (description && openHeader.current === base.course_header) {
      setSelected((cur) => (cur && cur.course_header === base.course_header ? { ...cur, description } : cur));
    }
  };
  const closeDialog = () => {
    openHeader.current = null;
    setSelected(null);
  };

  const yToMin = (colTop: number, clientY: number) => {
    const min = Math.round((((clientY - colTop) / HOUR_PX) * 60) / SNAP) * SNAP;
    return Math.max(0, Math.min(DAY_MIN, min));
  };

  // Drag empty space to sketch a new time block; commit on release.
  const startCreate = (e: React.PointerEvent, dayIdx: number) => {
    if (e.button !== 0) return;
    const colTop = (e.currentTarget as HTMLElement).getBoundingClientRect().top;
    const anchor = yToMin(colTop, e.clientY);
    setPreview({ dayIdx, startMin: anchor, endMin: anchor });
    beginDrag(
      (ev) => {
        const cur = yToMin(colTop, ev.clientY);
        setPreview({ dayIdx, startMin: Math.min(anchor, cur), endMin: Math.max(anchor, cur) });
      },
      (ev) => {
        setPreview(null);
        const cur = yToMin(colTop, ev.clientY);
        const startMin = Math.min(anchor, cur);
        const endMin = Math.max(anchor, cur);
        if (endMin - startMin >= SNAP) onRequestCreate({ days: [dayIdx], startMin, endMin });
      }
    );
  };

  // Drag a block to shift its time and/or day (multi-day patterns shift together).
  const startMove = (e: React.PointerEvent, block: TimeBlock, originDay: number) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const startY = e.clientY;
    const len = block.endMin - block.startMin;
    const minD = Math.min(...block.days);
    const maxD = Math.max(...block.days);
    const compute = (clientX: number, clientY: number) => {
      const deltaMin = Math.round((((clientY - startY) / HOUR_PX) * 60) / SNAP) * SNAP;
      const start = Math.max(0, Math.min(DAY_MIN - len, block.startMin + deltaMin));
      let dayDelta = 0;
      const rect = columnsRef.current?.getBoundingClientRect();
      if (rect && days.length > 0) {
        const colW = rect.width / days.length;
        const targetCol = Math.max(0, Math.min(days.length - 1, Math.floor((clientX - rect.left) / colW)));
        dayDelta = Math.max(-minD, Math.min(days.length - 1 - maxD, targetCol - originDay));
      }
      return { start, end: start + len, days: block.days.map((d) => d + dayDelta) };
    };
    const preview = (clientX: number, clientY: number) => {
      const { start, end, days: nd } = compute(clientX, clientY);
      setMovePreview({ id: block.id, label: block.label, days: nd, startMin: start, endMin: end });
    };
    beginDrag(
      (ev) => preview(ev.clientX, ev.clientY),
      (ev) => {
        setMovePreview(null);
        const { start, end, days: nd } = compute(ev.clientX, ev.clientY);
        if (start !== block.startMin || nd.join() !== block.days.join()) {
          onUpdateBlock({ ...block, startMin: start, endMin: end, days: nd });
        }
      }
    );
  };

  // Drag a block's top/bottom edge to change its start/end (the opposite edge stays put).
  const startResize = (e: React.PointerEvent, block: TimeBlock, edge: "top" | "bottom") => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const startY = e.clientY;
    const compute = (clientY: number) => {
      const delta = Math.round((((clientY - startY) / HOUR_PX) * 60) / SNAP) * SNAP;
      if (edge === "top") {
        const start = Math.max(0, Math.min(block.endMin - SNAP, block.startMin + delta));
        return { start, end: block.endMin };
      }
      const end = Math.min(DAY_MIN, Math.max(block.startMin + SNAP, block.endMin + delta));
      return { start: block.startMin, end };
    };
    beginDrag(
      (ev) => {
        const { start, end } = compute(ev.clientY);
        setMovePreview({ id: block.id, label: block.label, days: block.days, startMin: start, endMin: end });
      },
      (ev) => {
        setMovePreview(null);
        const { start, end } = compute(ev.clientY);
        if (start !== block.startMin || end !== block.endMin) {
          onUpdateBlock({ ...block, startMin: start, endMin: end });
        }
      }
    );
  };

  const courseBlocks: Block[] = [];
  const noMeeting: ScheduleSection[] = [];
  for (const sec of sections) {
    let placed = false;
    for (const meeting of sec.meetings) {
      const range = parseHourRange(meeting.hours);
      const days = parseDays(meeting.days);
      if (!range || days.length === 0) continue;
      placed = true;
      for (const d of days) {
        courseBlocks.push({
          sectionId: sec.section_id,
          code: sec.course_code,
          location: meeting.location,
          dayIdx: d,
          startMin: range.startMin,
          endMin: range.endMin,
          color: sectionColor(sec),
          lane: 0,
          lanes: 1,
          conflict: false,
          source: sec,
        });
      }
    }
    if (!placed) noMeeting.push(sec);
  }

  const blockInstances: BlockInstance[] = [];
  const blockDays: number[] = [];
  for (const tb of timeBlocks) {
    for (const d of tb.days) {
      blockInstances.push({ block: tb, dayIdx: d });
      blockDays.push(d);
    }
  }

  const maxDay = Math.max(4, ...courseBlocks.map((b) => b.dayIdx).concat(blockDays));
  const days = Array.from({ length: maxDay + 1 }, (_, i) => i);

  const totalHeight = (DAY_MIN / 60) * HOUR_PX;
  const hours = Array.from({ length: 25 }, (_, i) => i);

  const byDay = new Map<number, Block[]>();
  for (const b of courseBlocks) {
    const arr = byDay.get(b.dayIdx) ?? [];
    arr.push(b);
    byDay.set(b.dayIdx, arr);
  }

  const blocksByDay = new Map<number, BlockInstance[]>();
  for (const inst of blockInstances) {
    const arr = blocksByDay.get(inst.dayIdx) ?? [];
    arr.push(inst);
    blocksByDay.set(inst.dayIdx, arr);
  }

  // Lane courses + blocks together per day (side by side on overlap); the dragged block uses its live preview position.
  const movingId = movePreview?.id ?? null;
  const movingBlock = movingId ? timeBlocks.find((b) => b.id === movingId) ?? null : null;
  type BlockLaid = { block: TimeBlock; startMin: number; endMin: number; lane: number; lanes: number; preview: boolean };
  const courseLayout = new Map<number, Block[]>();
  const blockLayout = new Map<number, BlockLaid[]>();
  for (const d of days) {
    const dayCourses = byDay.get(d) ?? [];
    const items: Array<
      | { kind: "course"; course: Block; startMin: number; endMin: number }
      | { kind: "block"; block: TimeBlock; startMin: number; endMin: number; preview: boolean }
    > = dayCourses.map((c) => ({ kind: "course" as const, course: c, startMin: c.startMin, endMin: c.endMin }));
    for (const inst of blocksByDay.get(d) ?? []) {
      if (inst.block.id === movingId) continue; // drawn at its live preview position instead
      items.push({ kind: "block", block: inst.block, startMin: inst.block.startMin, endMin: inst.block.endMin, preview: false });
    }
    if (movingBlock && movePreview && movePreview.days.includes(d)) {
      items.push({ kind: "block", block: movingBlock, startMin: movePreview.startMin, endMin: movePreview.endMin, preview: true });
    }
    const courses: Block[] = [];
    const blocks: BlockLaid[] = [];
    for (const it of assignLanes(items)) {
      if (it.kind === "course") {
        const conflict = dayCourses.some(
          (o) => o !== it.course && o.startMin < it.course.endMin && it.course.startMin < o.endMin
        );
        courses.push({ ...it.course, lane: it.lane, lanes: it.lanes, conflict });
      } else {
        blocks.push({ block: it.block, startMin: it.startMin, endMin: it.endMin, lane: it.lane, lanes: it.lanes, preview: it.preview });
      }
    }
    courseLayout.set(d, courses);
    blockLayout.set(d, blocks);
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex min-h-0 flex-1 flex-col overflow-x-auto rounded-lg border">
        <div className="flex min-h-0 min-w-[640px] flex-1 flex-col">
          {/* Day headers (stay put while the grid scrolls vertically) */}
          <div className="flex shrink-0 border-b bg-muted/30">
            <div className="w-14 shrink-0" />
            {days.map((d) => (
              <div key={d} className="flex-1 px-2 py-2 text-center text-xs font-medium text-muted-foreground">
                {DAY_LABELS[d]}
              </div>
            ))}
          </div>

          {/* Scrollable 24h body */}
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
            <div className="flex select-none" style={{ height: totalHeight }}>
              {/* Time gutter */}
              <div className="relative w-14 shrink-0">
                {hours.map((h, i) => (
                  <div
                    key={h}
                    className="absolute right-1.5 -translate-y-1/2 text-[10px] text-muted-foreground"
                    style={{ top: i * HOUR_PX }}
                  >
                    {i === 0 ? "" : minuteLabel((h % 24) * 60)}
                  </div>
                ))}
              </div>

              {/* Day columns */}
              <div ref={columnsRef} className="grid flex-1" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
                {days.map((d) => (
                  <div
                    key={d}
                    className="relative border-l"
                    style={{ height: totalHeight }}
                    onPointerDown={(e) => startCreate(e, d)}
                  >
                    {hours.map((h, i) => (
                      <div
                        key={h}
                        className="pointer-events-none absolute inset-x-0 border-t border-border/40"
                        style={{ top: i * HOUR_PX }}
                      />
                    ))}

                    {/* Time-block bands; drag to move, edges to resize, dragged one shows as a ghost. */}
                    {(blockLayout.get(d) ?? []).map((it) =>
                      it.preview ? (
                        <div
                          key={`preview-${it.block.id}`}
                          className="pointer-events-none absolute overflow-hidden rounded-md border border-texas/50 bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground ring-2 ring-texas/50"
                          style={{
                            top: (it.startMin / 60) * HOUR_PX + 1,
                            height: Math.max(((it.endMin - it.startMin) / 60) * HOUR_PX - 2, 14),
                            left: `calc(${(it.lane / it.lanes) * 100}% + 2px)`,
                            width: `calc(${(1 / it.lanes) * 100}% - 4px)`,
                          }}
                        >
                          <span className="truncate">{it.block.label}</span>
                          <div className="opacity-70">
                            {minuteLabel(it.startMin)}–{minuteLabel(it.endMin)}
                          </div>
                        </div>
                      ) : (
                        <div
                          key={`${it.block.id}-${d}`}
                          onPointerDown={(e) => startMove(e, it.block, d)}
                          className="group/blk absolute cursor-grab touch-none overflow-hidden rounded-md border border-dashed border-muted-foreground/30 bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground active:cursor-grabbing"
                          style={{
                            top: (it.startMin / 60) * HOUR_PX + 1,
                            height: Math.max(((it.endMin - it.startMin) / 60) * HOUR_PX - 2, 14),
                            left: `calc(${(it.lane / it.lanes) * 100}% + 2px)`,
                            width: `calc(${(1 / it.lanes) * 100}% - 4px)`,
                          }}
                        >
                          <div className="flex items-start justify-between gap-1">
                            <span className="truncate font-medium">{it.block.label}</span>
                            <span className="relative z-20 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/blk:opacity-100">
                              <button
                                type="button"
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onRequestEdit(it.block);
                                }}
                                title="Edit Time Block"
                                aria-label="Edit Time Block"
                                className="cursor-pointer rounded p-0.5 hover:bg-black/10"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onRemoveBlock(it.block.id);
                                }}
                                title="Remove Time Block"
                                aria-label="Remove Time Block"
                                className="cursor-pointer rounded p-0.5 hover:bg-black/10"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          </div>
                          <div
                            onPointerDown={(e) => startResize(e, it.block, "top")}
                            className="absolute inset-x-0 top-0 z-10 h-1.5 cursor-ns-resize touch-none"
                          />
                          <div
                            onPointerDown={(e) => startResize(e, it.block, "bottom")}
                            className="absolute inset-x-0 bottom-0 z-10 h-1.5 cursor-ns-resize touch-none"
                          />
                        </div>
                      )
                    )}

                    {/* Drag-to-create preview */}
                    {preview && preview.dayIdx === d && preview.endMin > preview.startMin && (
                      <div
                        className="pointer-events-none absolute inset-x-0.5 overflow-hidden rounded-md border border-texas/50 bg-texas/20 px-1.5 py-0.5 text-[10px] text-texas"
                        style={{
                          top: (preview.startMin / 60) * HOUR_PX + 1,
                          height: Math.max(((preview.endMin - preview.startMin) / 60) * HOUR_PX - 2, 14),
                        }}
                      >
                        {minuteLabel(preview.startMin)}–{minuteLabel(preview.endMin)}
                      </div>
                    )}

                    {/* Course blocks */}
                    {(courseLayout.get(d) ?? []).map((b) => (
                      <div
                        key={`${b.sectionId}-${b.startMin}-${b.lane}`}
                        role="button"
                        tabIndex={0}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => openCourse(b.source)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openCourse(b.source);
                          }
                        }}
                        className={cn(
                          "group absolute cursor-pointer overflow-hidden rounded-md px-1.5 py-1 text-left text-[11px] leading-tight outline-none focus-visible:ring-2 focus-visible:ring-texas/40",
                          b.color.bg,
                          b.color.text,
                          b.conflict && "ring-2 ring-red-500"
                        )}
                        style={{
                          top: ((b.startMin) / 60) * HOUR_PX + 1,
                          height: Math.max(((b.endMin - b.startMin) / 60) * HOUR_PX - 2, 18),
                          left: `calc(${(b.lane / b.lanes) * 100}% + 2px)`,
                          width: `calc(${(1 / b.lanes) * 100}% - 4px)`,
                        }}
                      >
                        <button
                          type="button"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemove(b.sectionId);
                          }}
                          title="Remove from schedule"
                          aria-label="Remove from schedule"
                          className="absolute right-0.5 top-0.5 cursor-pointer rounded p-0.5 opacity-0 transition-opacity hover:bg-black/10 group-hover:opacity-100"
                        >
                          <X className="h-3 w-3" />
                        </button>
                        <div className="truncate font-semibold">{b.code}</div>
                        <div className="truncate opacity-80">
                          {minuteLabel(b.startMin)}–{minuteLabel(b.endMin)}
                        </div>
                        {b.location && <div className="truncate opacity-60">{b.location}</div>}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {noMeeting.length > 0 && (
        <div className="shrink-0 rounded-lg border p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            No set meeting time
          </p>
          <div className="flex flex-wrap gap-2">
            {noMeeting.map((s) => {
              const color = sectionColor(s);
              return (
                <span
                  key={s.section_id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openCourse(s)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openCourse(s);
                    }
                  }}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-texas/40",
                    color.bg,
                    color.text
                  )}
                >
                  <span className="font-medium">{s.course_code}</span>
                  {s.instruction_mode && <span className="opacity-70">{s.instruction_mode}</span>}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(s.section_id);
                    }}
                    title="Remove from schedule"
                    aria-label="Remove from schedule"
                    className="cursor-pointer rounded-full p-0.5 hover:bg-black/10"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      )}

      <CourseDialog section={selected} onClose={closeDialog} />
    </div>
  );
}

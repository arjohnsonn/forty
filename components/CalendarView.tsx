"use client";

import { useEffect, useState } from "react";
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  CalendarPlus,
  CalendarDays,
  Clock,
  Upload,
  FileImage,
  FileJson,
  FileText,
} from "lucide-react";
import { useSchedules, type ScheduleRow } from "@/lib/schedules";
import WeeklyGrid from "@/components/WeeklyGrid";
import TimePicker from "@/components/TimePicker";
import { courseMeta } from "@/lib/courses";
import { exportPng, exportIcs, exportJson, exportTxt } from "@/lib/schedule-export";

type BlockDraft = { id?: string; label: string; days: number[]; startMin: number; endMin: number };

const BLOCK_DAYS: [string, number][] = [
  ["M", 0],
  ["T", 1],
  ["W", 2],
  ["Th", 3],
  ["F", 4],
  ["Sa", 5],
  ["Su", 6],
];
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export default function CalendarView() {
  const {
    schedules,
    loading,
    activeId,
    setActiveId,
    createSchedule,
    renameSchedule,
    deleteSchedule,
    reorderSchedules,
    removeSection,
    addBlock,
    updateBlock,
    removeBlock,
  } = useSchedules();

  const active = schedules.find((s) => s.id === activeId) ?? schedules[0] ?? null;

  // Keep a valid active schedule selected as the list loads / changes. `activeId` lives in the shared store, so the planner can pre-select the schedule it just built before navigating here.
  useEffect(() => {
    if ((!activeId || !schedules.some((s) => s.id === activeId)) && schedules[0]) {
      setActiveId(schedules[0].id);
    }
  }, [schedules, activeId, setActiveId]);

  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [renameTarget, setRenameTarget] = useState<ScheduleRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ScheduleRow | null>(null);

  // Drag-to-reorder schedule tabs (live preview via `order`, persisted on drop).
  const [dragId, setDragId] = useState<string | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const tabs = dragId
    ? (order.map((id) => schedules.find((s) => s.id === id)).filter((s): s is ScheduleRow => !!s))
    : schedules;
  const onTabDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!dragId || dragId === targetId) return;
    setOrder((prev) => {
      const from = prev.indexOf(dragId);
      const to = prev.indexOf(targetId);
      if (from === -1 || to === -1) return prev;
      const next = prev.slice();
      next.splice(from, 1);
      next.splice(to, 0, dragId);
      return next;
    });
  };
  const onTabDragEnd = () => {
    if (dragId && order.length) reorderSchedules(order);
    setDragId(null);
  };

  const openCreate = () => {
    setDraftName(`Schedule ${schedules.length + 1}`);
    setCreating(true);
  };

  const handleCreate = async () => {
    const name = draftName.trim();
    setCreating(false);
    if (!name) return;
    const created = await createSchedule(name);
    if (created) setActiveId(created.id);
  };

  const handleRename = async () => {
    const target = renameTarget;
    const name = draftName.trim();
    setRenameTarget(null);
    if (!target || !name || name === target.name) return;
    renameSchedule(target.id, name);
  };

  const handleDelete = async () => {
    const target = deleteTarget;
    setDeleteTarget(null);
    if (target) deleteSchedule(target.id);
  };

  const [blockDraft, setBlockDraft] = useState<BlockDraft | null>(null);

  const openBlock = () => setBlockDraft({ label: "", days: [], startMin: 12 * 60, endMin: 13 * 60 });
  const editDay = (d: number) =>
    setBlockDraft((prev) =>
      prev
        ? { ...prev, days: prev.days.includes(d) ? prev.days.filter((x) => x !== d) : [...prev.days, d] }
        : prev
    );
  const blockValid =
    !!blockDraft &&
    !!blockDraft.label.trim() &&
    blockDraft.days.length > 0 &&
    blockDraft.endMin > blockDraft.startMin;
  const handleSaveBlock = () => {
    if (!active || !blockDraft || !blockValid) return;
    const block = {
      id: blockDraft.id ?? crypto.randomUUID(),
      label: blockDraft.label.trim(),
      days: [...blockDraft.days].sort((a, z) => a - z),
      startMin: blockDraft.startMin,
      endMin: blockDraft.endMin,
    };
    if (blockDraft.id) updateBlock(active.id, block);
    else addBlock(active.id, block);
    setBlockDraft(null);
  };

  const credits = active
    ? active.sections.reduce((n, s) => n + (courseMeta(s.course_code)?.credits ?? 0), 0)
    : 0;

  return (
    <div className="relative flex min-h-0 w-full flex-1 flex-col">
      <div className="shrink-0 border-b bg-background px-4 pb-3 pl-14 pt-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            <h2 className="shrink-0 text-lg font-semibold text-foreground">Calendar</h2>
            {active && (
              <>
                <Badge variant="secondary" className="shrink-0 font-normal">
                  {active.sections.length} {active.sections.length === 1 ? "course" : "courses"}
                </Badge>
                <Badge variant="secondary" className="shrink-0 font-normal">
                  {credits} {credits === 1 ? "hour" : "hours"}
                </Badge>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    title="Schedule options"
                    aria-label="Schedule options"
                    className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem
                      onClick={() => {
                        setDraftName(active.name);
                        setRenameTarget(active);
                      }}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setDeleteTarget(active)}
                      className="text-red-500 focus:bg-red-500/10 focus:text-red-500"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {active && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline">
                    <Upload className="mr-1.5 h-4 w-4" />
                    Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => exportPng(active)}>
                    <FileImage className="mr-2 h-4 w-4" />
                    Save as .png
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportIcs(active)}>
                    <CalendarDays className="mr-2 h-4 w-4" />
                    Save as .ics
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportJson(active)}>
                    <FileJson className="mr-2 h-4 w-4" />
                    Save as .json
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportTxt(active)}>
                    <FileText className="mr-2 h-4 w-4" />
                    Save as .txt
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {active && (
              <Button size="sm" variant="outline" onClick={openBlock}>
                <Clock className="mr-1.5 h-4 w-4" />
                Time Block
              </Button>
            )}
            <Button size="sm" className="bg-texas text-white hover:bg-texas/90" onClick={openCreate}>
              <Plus className="mr-1.5 h-4 w-4" />
              New Schedule
            </Button>
          </div>
        </div>
        {schedules.length > 0 && (
          <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1">
            {tabs.map((s) => (
              <button
                key={s.id}
                type="button"
                draggable
                onDragStart={() => {
                  setDragId(s.id);
                  setOrder(schedules.map((x) => x.id));
                }}
                onDragOver={(e) => onTabDragOver(e, s.id)}
                onDragEnd={onTabDragEnd}
                onClick={() => setActiveId(s.id)}
                className={cn(
                  "shrink-0 cursor-grab rounded-full border px-3 py-1 text-xs transition-colors active:cursor-grabbing",
                  dragId === s.id && "opacity-50",
                  active?.id === s.id
                    ? "border-texas/40 bg-texas/10 text-texas"
                    : "text-muted-foreground hover:border-texas/40 hover:text-texas"
                )}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="flex h-full w-full flex-col px-4 py-5">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !active ? (
            <EmptyState
              icon={<CalendarPlus className="h-8 w-8 text-muted-foreground" />}
              title="No schedules yet"
              body="Create a schedule, then add courses to it from chat or a course card."
              action={
                <Button className="bg-texas text-white hover:bg-texas/90" onClick={openCreate}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  New Schedule
                </Button>
              }
            />
          ) : (
            <WeeklyGrid
              sections={active.sections}
              timeBlocks={active.blocks}
              onRemove={(sectionId) => removeSection(active.id, sectionId)}
              onRemoveBlock={(blockId) => removeBlock(active.id, blockId)}
              onUpdateBlock={(block) => updateBlock(active.id, block)}
              onRequestCreate={(draft) =>
                setBlockDraft({ label: "", days: draft.days, startMin: draft.startMin, endMin: draft.endMin })
              }
              onRequestEdit={(block) =>
                setBlockDraft({
                  id: block.id,
                  label: block.label,
                  days: block.days,
                  startMin: block.startMin,
                  endMin: block.endMin,
                })
              }
            />
          )}
        </div>
      </div>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New Schedule</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleCreate();
              }
            }}
            placeholder="Schedule name"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!draftName.trim()}>
              Create
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!renameTarget} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename schedule</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleRename();
              }
            }}
            placeholder="Schedule name"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleRename} disabled={!draftName.trim()}>
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete schedule?</DialogTitle>
            <DialogDescription>
              This permanently removes “{deleteTarget?.name}”. This can’t be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!blockDraft} onOpenChange={(open) => !open && setBlockDraft(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{blockDraft?.id ? "Edit Time Block" : "New Time Block"}</DialogTitle>
            <DialogDescription>
              Block out a recurring time (lunch, work, gym) so you get a heads-up before adding a
              class that overlaps it.
            </DialogDescription>
          </DialogHeader>
          {blockDraft && (
            <>
              <Input
                autoFocus
                value={blockDraft.label}
                onChange={(e) => setBlockDraft({ ...blockDraft, label: e.target.value })}
                placeholder="Label (e.g. Lunch)"
              />
              <div className="flex gap-1">
                {BLOCK_DAYS.map(([lbl, idx]) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => editDay(idx)}
                    className={cn(
                      "h-8 flex-1 cursor-pointer rounded-md border text-xs transition-colors",
                      blockDraft.days.includes(idx)
                        ? "border-texas/40 bg-texas/10 text-texas"
                        : "text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <TimePicker value={blockDraft.startMin} onChange={(m) => setBlockDraft({ ...blockDraft, startMin: m })} />
                <span className="text-muted-foreground">to</span>
                <TimePicker value={blockDraft.endMin} onChange={(m) => setBlockDraft({ ...blockDraft, endMin: m })} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setBlockDraft(null)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveBlock} disabled={!blockValid}>
                  {blockDraft.id ? "Save" : "Add block"}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-3 pt-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">{icon}</div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">{body}</p>
      {action}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Check, X, TriangleAlert } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ToastAction, type ToastActionElement } from "@/components/ui/toast";
import { useToast } from "@/components/hooks/use-toast";
import { useSchedules, type ScheduleRow } from "@/lib/schedules";
import {
  sectionBlockConflicts,
  sectionCourseConflicts,
  type ScheduleSection,
} from "@/lib/courses";
import { cn } from "@/lib/utils";

/** Courses + time blocks in `s` that this section would overlap. */
const conflictsIn = (section: ScheduleSection, s: ScheduleRow): string[] => [
  ...sectionCourseConflicts(section, s.sections),
  ...sectionBlockConflicts(section, s.blocks),
];

// (+) to add `section` to a schedule; auto-adds (0/1) or shows a picker, warns on overlap, offers undo.
export default function AddToSchedule({
  section,
  className,
}: {
  section: ScheduleSection;
  className?: string;
}) {
  const { schedules, createSchedule, addSection, removeSection } =
    useSchedules();
  const { toast } = useToast();
  const router = useRouter();
  const [pending, setPending] = useState<{
    id: string;
    name: string;
    conflicts: string[];
  } | null>(null);

  const addTo = async (id: string, name: string) => {
    await addSection(id, section);
    toast({
      title: `Added to ${name}`,
      description: `${section.course_code} - #${section.section_id}`,
      action: (
        <div className="flex gap-2">
          <ToastAction
            altText="Undo add"
            onClick={() => {
              removeSection(id, section.section_id);
              toast({ title: `Removed from ${name}` });
            }}
          >
            Undo
          </ToastAction>
          <ToastAction
            altText="Go to calendar"
            onClick={() => router.push("/calendar")}
          >
            Go to
          </ToastAction>
        </div>
      ) as unknown as ToastActionElement,
    });
  };

  // Add, but warn first (dialog) if the course overlaps existing courses/time blocks.
  const attemptAdd = (s: ScheduleRow) => {
    const conflicts = conflictsIn(section, s);
    if (conflicts.length) setPending({ id: s.id, name: s.name, conflicts });
    else addTo(s.id, s.name);
  };

  const removeFrom = (s: ScheduleRow) => {
    removeSection(s.id, section.section_id);
    toast({ title: `Removed from ${s.name}` });
  };

  const createAndAdd = async () => {
    const created = await createSchedule(`Schedule ${schedules.length + 1}`);
    if (created) addTo(created.id, created.name); // new schedule is empty - no conflicts
  };

  const triggerClass = cn(
    "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-texas/40 align-middle text-texas transition-colors hover:bg-texas hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-texas/40",
    className,
  );

  const trigger =
    schedules.length <= 1 ? (
      <button
        type="button"
        title="Add to schedule"
        aria-label="Add to schedule"
        onClick={() => {
          const s = schedules[0];
          if (!s) return createAndAdd();
          if (s.sections.some((x) => x.section_id === section.section_id)) {
            toast({ title: `Already in ${s.name}` });
            return;
          }
          attemptAdd(s);
        }}
        className={triggerClass}
      >
        <Plus className="h-3 w-3" />
      </button>
    ) : (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title="Add to schedule"
            aria-label="Add to schedule"
            className={triggerClass}
          >
            <Plus className="h-3 w-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-72">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Add to schedule
          </DropdownMenuLabel>
          {schedules.map((s) => {
            const has = s.sections.some(
              (x) => x.section_id === section.section_id,
            );
            const conflicts = conflictsIn(section, s);
            return (
              <DropdownMenuItem
                key={s.id}
                onClick={() => (has ? removeFrom(s) : attemptAdd(s))}
                className="group gap-2"
              >
                {has ? (
                  <>
                    <Check className="h-3.5 w-3.5 shrink-0 group-hover:hidden" />
                    <X className="hidden h-3.5 w-3.5 shrink-0 text-red-500 group-hover:block" />
                  </>
                ) : (
                  <Check className="h-3.5 w-3.5 shrink-0 opacity-0" />
                )}
                <span className="truncate">{s.name}</span>
                {conflicts.length > 0 && (
                  <TriangleAlert
                    className="ml-auto h-3.5 w-3.5 shrink-0 text-amber-500"
                    aria-label={`Overlaps ${conflicts.join(", ")}`}
                  />
                )}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={createAndAdd} className="gap-2">
            <Plus className="h-3.5 w-3.5 shrink-0" />
            New Schedule
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );

  return (
    <>
      {trigger}
      <Dialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Schedule conflict</DialogTitle>
            <DialogDescription>
              {section.course_code} overlaps {pending?.conflicts.join(", ")} in{" "}
              {pending?.name}. Add it anyway?
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button
              className="bg-texas text-white hover:bg-texas/90"
              onClick={() => {
                if (pending) addTo(pending.id, pending.name);
                setPending(null);
              }}
            >
              Add anyway
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { Check, ChevronDown, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ToastAction, type ToastActionElement } from "@/components/ui/toast";
import { useToast } from "@/components/hooks/use-toast";
import { useSchedules, useTargetSchedule, type ScheduleRow } from "@/lib/schedules";
import {
  sectionBlockConflicts,
  sectionCourseConflicts,
  type ScheduleSection,
} from "@/lib/courses";
import { cn } from "@/lib/utils";

const conflictsIn = (section: ScheduleSection, s: ScheduleRow): string[] => [
  ...sectionCourseConflicts(section, s.sections),
  ...sectionBlockConflicts(section, s.blocks),
];

// Which schedule the (+) buttons add to and check conflicts against.
export function ScheduleTargetPicker({ className }: { className?: string }) {
  const { createSchedule } = useSchedules();
  const { current, target, setTarget } = useTargetSchedule();

  const createNew = async () => {
    const created = await createSchedule(`Schedule ${current.length + 1}`);
    if (created) setTarget(created.id);
  };

  return (
    <div className={cn("flex items-center gap-2 text-xs text-muted-foreground", className)}>
      <span>Adding to</span>
      <DropdownMenu>
        <DropdownMenuTrigger className="flex h-7 items-center gap-1.5 rounded-lg border px-2.5 font-medium text-foreground transition-colors hover:bg-muted">
          {target ? target.name : "New schedule"}
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-72">
          {current.map((s) => (
            <DropdownMenuItem key={s.id} onClick={() => setTarget(s.id)} className="gap-2">
              <Check className={cn("h-3.5 w-3.5 shrink-0", s.id !== target?.id && "opacity-0")} />
              <span className="truncate">{s.name}</span>
            </DropdownMenuItem>
          ))}
          {current.length > 0 && <DropdownMenuSeparator />}
          <DropdownMenuItem onClick={createNew} className="gap-2">
            <Plus className="h-3.5 w-3.5 shrink-0" />
            New schedule
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {target && <span>· conflicting sections are disabled</span>}
    </div>
  );
}

// (+) adds `section` to the target schedule; disabled when it overlaps a class or time block there.
export default function AddToSchedule({
  section,
  className,
}: {
  section: ScheduleSection;
  className?: string;
}) {
  const { createSchedule, addSection, removeSection } = useSchedules();
  const { current, target, setTarget } = useTargetSchedule();
  const { toast } = useToast();
  const router = useRouter();

  const added = !!target?.sections.some((x) => x.section_id === section.section_id);
  const conflicts = target && !added ? conflictsIn(section, target) : [];
  const blocked = conflicts.length > 0;
  const label = added
    ? `In ${target!.name}. Click to remove`
    : blocked
      ? `Conflicts with ${conflicts.join(", ")} in ${target!.name}`
      : `Add to ${target ? target.name : "a new schedule"}`;

  const addTo = async (s: { id: string; name: string }) => {
    await addSection(s.id, section);
    toast({
      title: `Added to ${s.name}`,
      description: `${section.course_code} - #${section.section_id}`,
      action: (
        <div className="flex gap-2">
          <ToastAction
            altText="Undo add"
            onClick={() => {
              removeSection(s.id, section.section_id);
              toast({ title: `Removed from ${s.name}` });
            }}
          >
            Undo
          </ToastAction>
          <ToastAction altText="Go to calendar" onClick={() => router.push("/calendar")}>
            Go to
          </ToastAction>
        </div>
      ) as unknown as ToastActionElement,
    });
  };

  const onClick = async () => {
    if (added && target) {
      removeSection(target.id, section.section_id);
      toast({ title: `Removed from ${target.name}` });
      return;
    }
    if (blocked && target) {
      toast({
        variant: "destructive",
        title: `Conflicts with ${conflicts.join(", ")}`,
        description: `Pick a different section or another schedule than ${target.name}.`,
      });
      return;
    }
    if (target) return addTo(target);
    const created = await createSchedule(`Schedule ${current.length + 1}`);
    if (!created) return;
    setTarget(created.id);
    addTo(created);
  };

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-disabled={blocked || undefined}
      onClick={onClick}
      className={cn(
        "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border align-middle transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-texas/40",
        added && "border-texas bg-texas text-white hover:bg-texas/80",
        blocked && "cursor-not-allowed border-muted-foreground/30 text-muted-foreground/40",
        !added && !blocked && "border-texas/40 text-texas hover:bg-texas hover:text-white",
        className,
      )}
    >
      {added ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
    </button>
  );
}

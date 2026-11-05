"use client";

import { CalendarCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function AgenticToggle({
  agentic,
  onToggle,
}: {
  agentic: boolean;
  onToggle: () => void;
}) {
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            onClick={onToggle}
            aria-pressed={agentic}
            aria-label="Schedule builder"
            className={cn(
              "h-9 w-9 shrink-0 self-center rounded-[10px] border p-0",
              agentic
                ? "border-transparent bg-foreground text-background hover:bg-foreground/90"
                : "border-input text-muted-foreground hover:bg-foreground/5",
            )}
          >
            <CalendarCog className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[230px]">
          <p className="font-medium">
            Schedule builder: {agentic ? "on" : "off"}
          </p>
          <p className="opacity-80">
            Lets Forty build and compare full weekly schedules. It uses a few
            more credits, so it starts off.
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

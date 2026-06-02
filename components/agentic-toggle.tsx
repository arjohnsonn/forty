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
            className={cn(
              "h-9 w-9 shrink-0 self-center rounded-full border p-0 transition-colors",
              agentic
                ? "border-transparent bg-foreground text-background hover:bg-foreground/90"
                : "border-input text-muted-foreground hover:bg-foreground/5",
            )}
          >
            <CalendarCog className="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[230px]">
          <p className="font-medium">
            Agentic scheduling: {agentic ? "On" : "Off"}
          </p>
          <p className="opacity-80">
            Lets Forty build &amp; compare full schedules. It costs slightly more AI
            credits, so it&apos;s off by default - turn it on when you want a
            schedule built.
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

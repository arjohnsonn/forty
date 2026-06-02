"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { Sparkles, Check, X } from "lucide-react";
import { createCheckoutSession } from "@/app/actions";
import { useToast } from "@/components/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const ROWS: { label: string; free: boolean; pro: boolean }[] = [
  { label: "Build, compare & plan with AI", free: true, pro: true },
  { label: "Professor ratings & grade data", free: true, pro: true },
  { label: "Generous monthly AI usage", free: false, pro: true },
  { label: "No limits during registration", free: false, pro: true },
  { label: "Stays active all semester", free: false, pro: true },
];

export function UpgradeDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [upgrading, setUpgrading] = useState(false);

  const handleUpgrade = async () => {
    setUpgrading(true);
    const res = await createCheckoutSession();
    if (res?.url) {
      window.location.href = res.url;
      return;
    }
    setUpgrading(false);
    toast({
      variant: "destructive",
      title: res?.error ?? "Couldn't start checkout",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-texas" /> Forty Pro
          </DialogTitle>
          <DialogDescription>
            More AI for the whole semester. A one-time charge, no subscription.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-6 gap-y-3 text-sm">
          <div />
          <div className="text-center text-xs font-medium text-muted-foreground">
            Free
          </div>
          <div className="text-center text-xs font-semibold text-texas">
            Pro
          </div>
          {ROWS.map((r) => (
            <Fragment key={r.label}>
              <div className="text-muted-foreground">{r.label}</div>
              <div className="flex justify-center">
                {r.free ? (
                  <Check className="h-4 w-4 text-foreground/70" />
                ) : (
                  <X className="h-4 w-4 text-muted-foreground/40" />
                )}
              </div>
              <div className="flex justify-center">
                {r.pro ? (
                  <Check className="h-4 w-4 text-texas" />
                ) : (
                  <X className="h-4 w-4 text-muted-foreground/40" />
                )}
              </div>
            </Fragment>
          ))}
        </div>

        <Button
          onClick={handleUpgrade}
          disabled={upgrading}
          className="w-full bg-texas text-white hover:bg-texas/90"
        >
          {upgrading ? "Starting…" : "Upgrade - $3.99 / semester"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          One-time charge - active until the end of the semester
        </p>
        <p className="text-center text-xs text-muted-foreground">
          By upgrading you agree to our{" "}
          <Link
            href="/terms"
            target="_blank"
            className="underline hover:text-foreground"
          >
            Terms
          </Link>{" "}
          and{" "}
          <Link
            href="/refund"
            target="_blank"
            className="underline hover:text-foreground"
          >
            Refund Policy
          </Link>
          .
        </p>
      </DialogContent>
    </Dialog>
  );
}

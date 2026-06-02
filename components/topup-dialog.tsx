"use client";

import { useState } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { createCheckoutSession } from "@/app/actions";
import { useToast } from "@/components/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MIN_TOPUP_USD, TOPUP_PRESETS, estMessages } from "@/lib/credits";

export function TopUpDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [amount, setAmount] = useState("5");
  const [loading, setLoading] = useState(false);

  const dollars = Number(amount);
  const valid =
    Number.isFinite(dollars) && dollars >= MIN_TOPUP_USD && dollars <= 500;

  const handleCheckout = async () => {
    if (!valid) return;
    setLoading(true);
    const res = await createCheckoutSession(Math.round(dollars * 100));
    if (res?.url) {
      window.location.href = res.url;
      return;
    }
    setLoading(false);
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
            <Sparkles className="h-5 w-5 text-texas" /> Add AI Credits
          </DialogTitle>
          <DialogDescription>
            Pay what you want and your credits never expire. Use them to build,
            compare, and plan your schedule with AI.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2">
          {TOPUP_PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setAmount(String(p))}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-md border py-3 transition-colors",
                dollars === p
                  ? "border-texas bg-texas/10 text-texas"
                  : "border-input text-muted-foreground hover:bg-foreground/5",
              )}
            >
              <span className="text-base font-semibold">${p}</span>
              <span className="text-xs">≈{estMessages(p)} msgs</span>
            </button>
          ))}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="topup-amount">Custom amount (USD)</Label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
              $
            </span>
            <Input
              id="topup-amount"
              type="number"
              min={MIN_TOPUP_USD}
              max={500}
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="pl-7"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {valid
              ? `≈ ${estMessages(dollars)} messages - credits never expire`
              : `Enter an amount between $${MIN_TOPUP_USD} and $500`}
          </p>
        </div>

        <Button
          onClick={handleCheckout}
          disabled={!valid || loading}
          className="w-full bg-texas text-white hover:bg-texas/90"
        >
          {loading
            ? "Starting…"
            : valid
              ? `Add $${dollars.toFixed(2)} in Credits`
              : "Add Credits"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          By continuing you agree to our{" "}
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

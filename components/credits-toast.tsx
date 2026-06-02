"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/hooks/use-toast";

// After Checkout redirects to /?credits=1, toast + refresh so the new balance shows.
export function CreditsToast() {
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("credits") !== "1")
      return;

    window.history.replaceState({}, "", window.location.pathname);
    setTimeout(
      () =>
        toast({
          title: "🎉 Credits added!",
          description: "Thanks for supporting Forty. Happy planning!",
        }),
      50,
    );
    setTimeout(() => router.refresh(), 2000);
  }, [router, toast]);

  return null;
}

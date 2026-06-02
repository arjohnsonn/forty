"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/hooks/use-toast";

// After Stripe Checkout redirects to /?upgraded=1, celebrate and refresh so the server-rendered
// Pro state (sidebar nudge / badge) flips once the webhook has set pro_until.
export function UpgradeToast() {
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("upgraded") !== "1")
      return;
    // Drop the query param so a manual refresh doesn't re-fire this.
    window.history.replaceState({}, "", window.location.pathname);
    // Defer the toast a tick: <Toaster> registers its listener in its own mount effect, and this
    // component mounts first, so firing synchronously would dispatch before it's listening and the
    // toast would be dropped. No cleanup, so these one-shot timers survive dev StrictMode's
    // mount/unmount/mount (the 2nd mount sees the param already removed and no-ops).
    setTimeout(
      () =>
        toast({
          title: "🎉 You're Pro!",
          description:
            "Thanks for supporting Forty! Enjoy the rest of the semester.",
        }),
      50,
    );
    setTimeout(() => router.refresh(), 2000);
  }, [router, toast]);

  return null;
}

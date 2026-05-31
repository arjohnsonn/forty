"use client";

import { useEffect } from "react";

// Dev-only: drop bare-Event rejections (Realtime/websocket reconnects, aborted fetches) so Next's
// overlay doesn't crash with an uninformative "[object Event]". Installs nothing in production.
export default function ClientErrorGuard() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;

    const isBareEvent = (v: unknown) => v instanceof Event;
    const onRejection = (e: PromiseRejectionEvent) => {
      if (isBareEvent(e.reason)) {
        e.preventDefault();
        console.warn("[Forty] Ignored non-Error promise rejection (likely a Realtime/websocket event):", e.reason);
      }
    };
    const onError = (e: ErrorEvent) => {
      if (isBareEvent(e.error)) {
        e.preventDefault();
        console.warn("[Forty] Ignored non-Error thrown value (likely a Realtime/websocket event):", e.error);
      }
    };

    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);
    return () => {
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
    };
  }, []);

  return null;
}

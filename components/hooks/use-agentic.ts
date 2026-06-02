"use client";

import { useEffect, useState } from "react";

const KEY = "forty:agentic";

// Current setting read synchronously - used at send time so the first message of a new chat
// isn't sent with a stale default before state hydrates from localStorage. Off by default.
export const getAgentic = () => {
  try {
    return (
      typeof window !== "undefined" && localStorage.getItem(KEY) === "true"
    );
  } catch {
    return false;
  }
};

// Agentic scheduling toggle (the expensive buildSchedule tool), persisted across sessions.
export function useAgentic() {
  const [agentic, setState] = useState(false);

  useEffect(() => {
    setState(getAgentic());
  }, []);

  const setAgentic = (v: boolean) => {
    setState(v);
    try {
      localStorage.setItem(KEY, String(v));
    } catch {
      // localStorage blocked (private mode/quota) - state still updates for this session.
    }
  };

  return { agentic, setAgentic };
}

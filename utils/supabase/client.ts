import { createBrowserClient } from "@supabase/ssr";

const make = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

let browserClient: ReturnType<typeof make> | undefined;

// singleton
export const createClient = () => {
  if (typeof window === "undefined") return make();
  if (!browserClient) browserClient = make();
  return browserClient;
};

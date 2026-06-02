import { createClient } from "@supabase/supabase-js";

// Service-role client for privileged operations (e.g. deleting a user). Server-only -
// must never be imported into client code, as it bypasses RLS.
export const createAdminClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

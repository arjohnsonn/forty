import { createClient } from "@/utils/supabase/server";
import NewChat from "@/components/NewChat";
import SignedOutLanding from "@/components/SignedOutLanding";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await searchParams;

  return user ? <NewChat /> : <SignedOutLanding error={error} />;
}

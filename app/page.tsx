import { createClient } from "@/utils/supabase/server";
import NewChat from "@/components/NewChat";
import SignedOutLanding from "@/components/SignedOutLanding";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user ? <NewChat /> : <SignedOutLanding />;
}

import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import BuildView from "@/components/BuildView";

export default async function BuildPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return redirect("/sign-in");

  return <BuildView />;
}

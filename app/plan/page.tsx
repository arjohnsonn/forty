import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import DegreePlanView from "@/components/DegreePlanView";

export default async function PlanPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return redirect("/");

  return <DegreePlanView />;
}

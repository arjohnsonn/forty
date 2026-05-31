import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import ProfessorsView from "@/components/ProfessorsView";

export default async function ProfessorsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return redirect("/sign-in");

  return <ProfessorsView />;
}

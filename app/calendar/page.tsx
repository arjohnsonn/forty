import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import CalendarView from "@/components/CalendarView";

export default async function CalendarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return redirect("/sign-in");

  return <CalendarView />;
}

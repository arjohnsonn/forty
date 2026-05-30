"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { useToast } from "@/components/hooks/use-toast";
import NewConvo from "@/components/NewConvo";

export default function NewChat() {
  const router = useRouter();
  const supabase = createClient();
  const { toast } = useToast();

  const handleStart = async (_greeting: string, query: string) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/sign-in");
      return;
    }

    // Seed the row with the user's message so the sidebar title is correct
    // immediately; the Worker overwrites it with the full thread once it replies.
    const userMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: query,
      parts: [{ type: "text", text: query }],
    };

    const { data, error } = await supabase
      .from("conversations")
      .insert({ user_id: user.id, messages: JSON.stringify([userMessage]) })
      .select("id")
      .single();

    if (error || !data) {
      toast({
        variant: "destructive",
        title: "Couldn't start chat",
        description: error?.message ?? "Please try again.",
      });
      return;
    }

    router.push(`/chat/${data.id}`);
  };

  return <NewConvo onSubmit={handleStart} />;
}

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useToast } from "@/components/hooks/use-toast";
import NewConvo from "@/components/NewConvo";
import Conversation from "@/components/Conversation";

export default function NewChat() {
  const router = useRouter();
  const supabase = createClient();
  const { toast } = useToast();
  const [started, setStarted] = useState<{ id: string; query: string } | null>(null);
  const startedRef = useRef(started);
  startedRef.current = started;

  const resetToLanding = () => {
    setStarted(null);
    window.history.replaceState(null, "", "/");
  };

  // "New chat" in the sidebar fires this — reset the in-place conversation back to the landing UI
  // (the router can't navigate to "/" when it already thinks it's there after an in-place start).
  useEffect(() => {
    const onNewChat = () => resetToLanding();
    // If the chat currently shown in-place gets deleted (from its header or the sidebar), reset too.
    const onDeleted = (e: Event) => {
      const { id } = (e as CustomEvent<{ id: string }>).detail;
      if (startedRef.current?.id === id) resetToLanding();
    };
    window.addEventListener("forty:new-chat", onNewChat);
    window.addEventListener("forty:deleted", onDeleted);
    return () => {
      window.removeEventListener("forty:new-chat", onNewChat);
      window.removeEventListener("forty:deleted", onDeleted);
    };
  }, []);

  const handleStart = async (_greeting: string, query: string) => {
    // getSession reads the local session (no network), so this stays instant.
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) {
      router.push("/sign-in");
      return;
    }

    // Switch to the conversation UI immediately and update the URL, then create the row in the
    // background — no waiting on the insert + a server round-trip before the message appears. The
    // client-generated id matches the row we insert, and the Worker persists by that id on finish
    // (which happens seconds later, well after the insert lands).
    const id = crypto.randomUUID();
    setStarted({ id, query });
    window.history.replaceState(null, "", `/chat/${id}`);

    // Seed the row with the user's message so the sidebar title is correct immediately; the Worker
    // overwrites it with the full thread once it replies.
    const userMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: query,
      parts: [{ type: "text", text: query }],
    };
    void supabase
      .from("conversations")
      .insert({ id, user_id: user.id, messages: JSON.stringify([userMessage]) })
      .then(({ error }) => {
        if (error) {
          toast({
            variant: "destructive",
            title: "Couldn't save chat",
            description: error.message,
          });
        }
      });
  };

  if (started) {
    return (
      <Conversation
        key={started.id}
        chatId={started.id}
        initialMessages={[]}
        pendingQuery={started.query}
      />
    );
  }

  return <NewConvo onSubmit={handleStart} />;
}

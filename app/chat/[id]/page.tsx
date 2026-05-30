import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import Conversation from "@/components/Conversation";
import { parseMessages, messageText } from "@/lib/conversations";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: convo, error } = await supabase
    .from("conversations")
    .select("id, messages, deleted")
    .eq("id", id)
    .maybeSingle();

  // RLS scopes this to the owner; a missing/foreign/deleted chat sends them home.
  if (error || !convo || convo.deleted) redirect("/");

  const all = parseMessages(convo.messages);
  const last = all[all.length - 1];
  const pendingQuery = last?.role === "user" ? messageText(last) : undefined;
  const initialMessages = pendingQuery ? all.slice(0, -1) : all;

  // `key` forces a fresh mount per chat so useChat re-seeds initialMessages.
  return (
    <Conversation
      key={id}
      chatId={id}
      initialMessages={initialMessages}
      pendingQuery={pendingQuery}
    />
  );
}

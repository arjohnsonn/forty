"use client";

import Conversation from "@/components/Conversation";
import NewConvo from "@/components/NewConvo";
import { useState } from "react";

export default function Home() {
  const [initialQuery, setInitialQuery] = useState("");
  const [showConversation, setShowConversation] = useState(false);

  const handleStartAndNewQuery = async (greeting: string, query: string) => {
    setInitialQuery(query);
    setShowConversation(true);
  };

  return showConversation ? (
    <Conversation title="New chat" initialQuery={initialQuery} />
  ) : (
    <div className="flex flex-1 items-center justify-center">
      <NewConvo onSubmit={handleStartAndNewQuery} />
    </div>
  );
}

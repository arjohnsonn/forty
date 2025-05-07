"use client";

import Conversation from "@/components/Conversation";
import NewConvo from "@/components/NewConvo";
import { useState } from "react";

export default function Home() {
  const [initialQuery, setInitialQuery] = useState("");
  const [showConversation, setShowConversation] = useState(false);

  // Called by NewConvo with initial greeting and user's first query
  const handleStartAndNewQuery = async (greeting: string, query: string) => {
    setInitialQuery(query);
    setShowConversation(true);
  };

  return (
    <div>
      {!showConversation ? (
        <NewConvo onSubmit={handleStartAndNewQuery} />
      ) : (
        <Conversation title="New chat" initialQuery={initialQuery} />
      )}
    </div>
  );
}

"use client";

import Conversation from "@/components/Conversation";
import NewConvo from "@/components/NewConvo";
import { useState } from "react";

export default function Home() {
  const [initialQuery, setInitialQuery] = useState("");
  const [showConversation, setShowConversation] = useState(false);

  const handleStartAndNewQuery = async (query: string) => {
    setInitialQuery(query);
    setShowConversation(true);
  };

  return (
    <div className="flex-1 flex items-center justify-center">
      {!showConversation ? (
        <NewConvo onSubmit={handleStartAndNewQuery} />
      ) : (
        <Conversation title="New chat" initialQuery={initialQuery} />
      )}
    </div>
  );
}

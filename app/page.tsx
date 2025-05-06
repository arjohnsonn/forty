"use client";

import Conversation from "@/components/Conversation";
import NewConvo from "@/components/NewConvo";
import { useState, useEffect } from "react";

// Define chat message type
type Message = { id: string; role: "user" | "assistant"; content: string };

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [showConversation, setShowConversation] = useState(false);
  const [loading, setLoading] = useState(false);

  // Called by NewConvo with initial greeting and user's first query
  const handleStartAndNewQuery = async (greeting: string, query: string) => {
    const timestamp = Date.now();
    setMessages([{ id: timestamp.toString(), role: "user", content: query }]);
    setShowConversation(true);
    setLoading(true);

    try {
      const res = await fetch("/api/gpt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: query }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: data.message,
          },
        ]);
      } else {
        throw new Error(data.error || "Failed to fetch response");
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "Sorry, something went wrong.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {!showConversation ? (
        <NewConvo onSubmit={handleStartAndNewQuery} />
      ) : (
        <Conversation title="New chat" messages={messages} loading={loading} />
      )}
    </div>
  );
}

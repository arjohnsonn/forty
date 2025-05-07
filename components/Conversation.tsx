"use client";

import React from "react";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea, TextareaExpand } from "@/components/ui/textarea";
import { SendIcon, Loader2, Check, X, ArrowUp } from "lucide-react";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type ConversationProps = {
  title: string;
  messages: Message[];
  loading?: boolean;
};

const Conversation: React.FC<ConversationProps> = ({
  title,
  messages: initialMessages,
  loading = false,
}) => {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  const [rmpEnabled, setRmpEnabled] = useState(true);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const textarea = document.querySelector("textarea");
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [input]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/gpt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt: input }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to get response");
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.message,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Error:", error);
      // Add error message
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "Sorry, something went wrong. Please try again.",
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen">
      <div className="bg-background">
        <div className="max-w-screen-lg mx-auto px-4 py-4">
          <h1 className="text-xl font-bold">{title}</h1>
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto"
        style={{ scrollbarGutter: "stable both-edges" }}
      >
        <div className="max-w-screen-lg mx-auto px-4 py-4 flex flex-col h-full space-y-4">
          {messages.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-center text-muted-foreground">
              <div>
                <p>No messages yet</p>
                <p className="text-sm">
                  Start a conversation by typing a message below
                </p>
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`flex items-start gap-2 max-w-[80%] ${message.role === "user" ? "flex-row-reverse" : ""}`}
                >
                  <div
                    className={`rounded-lg px-3 py-2 ${
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    {message.content.split("\n").map((text, i) => (
                      <React.Fragment key={i}>
                        {text}
                        {i !== message.content.split("\n").length - 1 && <br />}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </div>
            ))
          )}

          {(isLoading || loading) && (
            <div className="flex justify-start">
              <div className="flex items-start gap-2 max-w-[80%]">
                <div className="rounded-lg px-3 py-2 bg-muted flex items-center">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Thinking...
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="bg-background">
        <div className="max-w-screen-lg mx-auto px-4 py-4">
          <form onSubmit={handleSubmit} className="w-full">
            <div className="flex flex-col items-center justify-center md:w-full w-[95%] rounded-xl border">
              <TextareaExpand
                className="rounded-xl w-full mt-2 resize-none overflow-y-auto max-h-60"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (input.trim())
                      handleSubmit(e as unknown as React.FormEvent);
                  }
                }}
                placeholder="Type your message..."
                disabled={isLoading || loading}
                required
              />
              <div className="flex flex-row justify-start gap-x-2 w-full px-3 pb-3">
                <div className="flex flex-row gap-x-2 justify-between w-full">
                  <Button
                    className="rounded-xl h-10 flex items-center justify-center gap-2 px-3"
                    variant="outline"
                    type="button"
                    onClick={() => setRmpEnabled(!rmpEnabled)}
                  >
                    {rmpEnabled ? (
                      <Check className="w-5 h-5 text-green-500" />
                    ) : (
                      <X className="w-5 h-5 text-red-500" />
                    )}
                    <span>RMP</span>
                  </Button>
                </div>
                <div className="flex flex-row">
                  <Button
                    className="rounded-full h-10 w-10 flex items-center justify-center p-0 bg-black dark:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    variant="outline"
                    type="submit"
                  >
                    <ArrowUp className="w-5 h-5 dark:text-black text-white" />
                  </Button>
                </div>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Conversation;

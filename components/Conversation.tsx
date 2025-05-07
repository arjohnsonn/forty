"use client";

import React from "react";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SendIcon, Loader2, Check, X } from "lucide-react";
import { useChat } from "@ai-sdk/react";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type ConversationProps = {
  title: string;
  initialQuery: string;
};

const Conversation: React.FC<ConversationProps> = ({ title, initialQuery }) => {
  const { messages, input, handleInputChange, handleSubmit, status, append } =
    useChat();

  const [rmpEnabled, setRmpEnabled] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // have state to prevent double rerender
    if (initialQuery) {
      const userMessage: Message = {
        id: Date.now().toString(),
        role: "user",
        content: initialQuery,
      };
      append(userMessage);
    }
  }, []);

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
                    {message.parts.map((part, i) => {
                      switch (part.type) {
                        case "text":
                          return (
                            <div key={`${message.id}-${i}`}>
                              {part.text}
                              {/* {i !== message.content.split("\n").length - 1 && (
                                <br />
                              )} */}
                            </div>
                          );
                      }
                    })}
                  </div>
                </div>
              </div>
            ))
          )}

          {status == "submitted" && (
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
            <div className="relative w-full">
              <Textarea
                value={input}
                onChange={handleInputChange}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (input.trim())
                      handleSubmit(e as unknown as React.FormEvent);
                  }
                }}
                placeholder="Type your message..."
                disabled={status != "ready"}
                className="w-full pr-12 py-3 pb-20 min-h-[40px] max-h-[200px] resize-none"
                style={{ height: "auto" }}
              />
              <Button
                variant="outline"
                onClick={() => setRmpEnabled(!rmpEnabled)}
                className="absolute left-2 bottom-2 rounded-xl h-10 flex items-center gap-1 px-2"
              >
                {rmpEnabled ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <X className="w-4 h-4 text-red-500" />
                )}
                <span className="text-sm">RMP</span>
              </Button>
              <Button
                type="submit"
                size="icon"
                disabled={status != "ready" || !input.trim()}
                className="absolute right-2 bottom-2 h-10 w-10"
              >
                {status != "ready" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <SendIcon className="h-4 w-4" />
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Conversation;

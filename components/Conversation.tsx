"use client";

import React from "react";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { TextareaExpand } from "@/components/ui/textarea";
import { Loader2, Check, X, ArrowUp } from "lucide-react";
import { useToast } from "@/components/hooks/use-toast";
import { useChat } from "@ai-sdk/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { createClient } from "@/utils/supabase/client";
import CourseChips from "@/components/CourseChips";

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
  const { toast } = useToast();

  const supabase = createClient();
  const [token, setToken] = useState<string>(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
  );

  const { messages, input, handleInputChange, handleSubmit, status, append } =
    useChat({
      // id,
      // initialMessages,
      api: process.env.NEXT_PUBLIC_CHAT_URL,
      sendExtraMessageFields: true,
      onError: (response) => {
        // Default toast error messages
        let errorName = "Error";
        let errorMessage = "Something went wrong. Please try again.";

        try {
          // Attempt to parse the error message in standard format
          const {
            error: { name, message },
          } = JSON.parse(response.message);

          errorName = name;
          errorMessage = message;
        } catch (e) {
          // If parsing fails, use the default error message
          errorMessage = response.message;
        }

        toast({
          variant: "destructive",
          title: errorName,
          description: errorMessage,
        });
      },
    });

  const [rmpEnabled, setRmpEnabled] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const initialSent = useRef(false);

  useEffect(() => {
    // StrictMode double-invokes effects in dev — guard so the initial query is sent only once.
    if (initialQuery && !initialSent.current) {
      initialSent.current = true;
      const getToken = async () => {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const authToken = session?.access_token ?? token;
        if (session) setToken(session.access_token);

        const userMessage: Message = {
          id: Date.now().toString(),
          role: "user",
          content: initialQuery,
        };

        append(userMessage, {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });
      };

      getToken();
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

  const handleSubmitToken = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const authToken = session?.access_token ?? token;
    if (session) setToken(session.access_token);

    handleSubmit(undefined, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
  };

  return (
    <div className="flex h-full w-full flex-col">
      {/* Sticky title */}
      <header className="shrink-0 border-b border-border/60 bg-background">
        <div className="mx-auto w-full max-w-3xl px-4 py-3">
          <h1 className="text-lg font-semibold">{title}</h1>
        </div>
      </header>

      {/* Scrollable messages */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ scrollbarGutter: "stable both-edges" }}
      >
        <div className="mx-auto w-full max-w-3xl px-4 py-6">
          {messages.length === 0 ? (
            <div className="flex min-h-[50vh] items-center justify-center text-center text-muted-foreground">
              <div>
                <p>No messages yet</p>
                <p className="text-sm">Start a conversation by typing a message below</p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((message) => {
                const text = message.parts
                  .filter((part) => part.type === "text")
                  .map((part) => part.text)
                  .join("");
                return message.role === "user" ? (
                  <div key={message.id} className="flex justify-end">
                    <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl bg-muted px-4 py-2.5">
                      {text}
                    </div>
                  </div>
                ) : (
                  <div
                    key={message.id}
                    className="prose max-w-none dark:prose-invert prose-p:leading-relaxed prose-pre:bg-muted"
                  >
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
                    <CourseChips annotations={message.annotations} />
                  </div>
                );
              })}

              {status === "submitted" && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Thinking...
                </div>
              )}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Pinned input bar */}
      <div className="shrink-0 bg-background">
        <div className="mx-auto w-full max-w-3xl px-4 pb-4 pt-2">
          <form onSubmit={handleSubmitToken}>
            <div className="flex flex-col rounded-2xl border bg-background shadow-sm transition-colors focus-within:ring-1 focus-within:ring-ring">
              <TextareaExpand
                className="max-h-60 w-full resize-none overflow-y-auto border-0 bg-transparent px-4 pt-3 focus-visible:ring-0"
                value={input}
                onChange={handleInputChange}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (input.trim())
                      handleSubmitToken(e as unknown as React.FormEvent);
                  }
                }}
                placeholder="Message UT Registration GPT…"
                disabled={status === "submitted"}
              />
              <div className="flex items-center justify-between px-3 pb-3">
                <Button
                  className="h-9 gap-2 rounded-full px-3"
                  variant="outline"
                  type="button"
                  onClick={() => setRmpEnabled(!rmpEnabled)}
                >
                  {rmpEnabled ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <X className="h-4 w-4 text-red-500" />
                  )}
                  <span>RMP</span>
                </Button>
                <Button
                  className="h-9 w-9 rounded-full bg-black p-0 disabled:opacity-50 dark:bg-white"
                  variant="outline"
                  type="submit"
                  disabled={status === "submitted" || !input.trim()}
                >
                  {status === "submitted" ? (
                    <Loader2 className="h-5 w-5 animate-spin text-white dark:text-black" />
                  ) : (
                    <ArrowUp className="h-5 w-5 text-white dark:text-black" />
                  )}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Conversation;

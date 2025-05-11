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
import { ToastAction } from "./ui/toast";

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
      api: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/chat`,
      sendExtraMessageFields: true,
      onError: (response) => {
        const {
          error: { name, message },
        } = JSON.parse(response.message) as {
          error: {
            name: string;
            message: string;
          };
        };

        toast({
          variant: "destructive",
          title: name,
          description: message
        });
      },
    });

  const [rmpEnabled, setRmpEnabled] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // have state to prevent double rerender
    if (initialQuery) {
      const getToken = async () => {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session) setToken(session.access_token);

        const userMessage: Message = {
          id: Date.now().toString(),
          role: "user",
          content: initialQuery,
        };

        append(userMessage, {
          headers: {
            Authorization: `Bearer ${token}`,
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

    if (session) setToken(session.access_token);

    handleSubmit(undefined, {
      headers: { Authorization: `Bearer ${token}` },
    });
  };

  return (
    <div className="flex flex-col w-[85%] h-full">
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
                    className={`rounded-lg px-3 py-2 flex flex-col prose dark:prose-invert prose-headings:mb-4 prose-p:mb-4 last:mb-0 prose-hr:my-8 ${
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    {(() => {
                      const combinedText = message.parts
                        .filter((part) => part.type === "text")
                        .map((part) => part.text)
                        .join("");

                      return (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {combinedText}
                        </ReactMarkdown>
                      );
                    })()}
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
          <form onSubmit={handleSubmitToken} className="w-full">
            <div className="flex flex-col items-center justify-center md:w-full w-[95%] rounded-xl border">
              <TextareaExpand
                className="rounded-xl w-full mt-2 resize-none overflow-y-auto max-h-60"
                value={input}
                onChange={handleInputChange}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (input.trim())
                      handleSubmitToken(e as unknown as React.FormEvent);
                  }
                }}
                placeholder="Type your message..."
                disabled={status === "submitted"}
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
                    disabled={status === "submitted" || !input.trim()}
                  >
                    {status === "submitted" ? (
                      <Loader2 className="w-5 h-5 animate-spin dark:text-black text-white" />
                    ) : (
                      <ArrowUp className="w-5 h-5 dark:text-black text-white" />
                    )}
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

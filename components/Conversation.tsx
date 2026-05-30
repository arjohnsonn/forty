"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { TextareaExpand } from "@/components/ui/textarea";
import { Loader2, ArrowUp, Copy, RefreshCw, ThumbsUp, ThumbsDown } from "lucide-react";
import { useToast } from "@/components/hooks/use-toast";
import { useChat } from "@ai-sdk/react";
import type { Message } from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { createClient } from "@/utils/supabase/client";
import CourseChips from "@/components/CourseChips";
import { messageText } from "@/lib/conversations";
import { cn } from "@/lib/utils";

type ConversationProps = {
  chatId: string;
  initialMessages: Message[];
  /** First user message awaiting a response (new chat or a prior unanswered turn). */
  pendingQuery?: string;
};

const Conversation: React.FC<ConversationProps> = ({
  chatId,
  initialMessages,
  pendingQuery,
}) => {
  const { toast } = useToast();
  const [supabase] = useState(() => createClient());

  const { messages, input, handleInputChange, handleSubmit, status, append, reload } =
    useChat({
      id: chatId,
      api: process.env.NEXT_PUBLIC_CHAT_URL,
      initialMessages,
      // The Worker reads `chatId` to persist the conversation on finish.
      body: { chatId },
      sendExtraMessageFields: true,
      onError: (response) => {
        let errorName = "Error";
        let errorMessage = "Something went wrong. Please try again.";
        try {
          const {
            error: { name, message },
          } = JSON.parse(response.message);
          errorName = name;
          errorMessage = message;
        } catch {
          errorMessage = response.message;
        }
        toast({ variant: "destructive", title: errorName, description: errorMessage });
      },
    });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingSent = useRef(false);
  const instanceId = useRef(Math.random().toString(36).slice(2, 7));
  const prevCount = useRef(0);
  const busy = status === "submitted" || status === "streaming";

  // [DupMsgDebug] Detect duplicate Conversation instances (StrictMode/remount).
  useEffect(() => {
    console.log(
      `[DupMsgDebug] MOUNT inst=${instanceId.current} chatId=${chatId} initialMessages=${initialMessages.length} pendingQuery=${
        pendingQuery ? JSON.stringify(pendingQuery.slice(0, 40)) : "none"
      }`
    );
    return () =>
      console.log(`[DupMsgDebug] UNMOUNT inst=${instanceId.current} chatId=${chatId}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const authHeaders = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token =
      session?.access_token ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
    return { Authorization: `Bearer ${token}` };
  }, [supabase]);

  // Send the unanswered first message exactly once (guards StrictMode double-mount).
  useEffect(() => {
    console.log(
      `[DupMsgDebug] pending effect run inst=${instanceId.current} hasPending=${!!pendingQuery} alreadySent=${pendingSent.current}`
    );
    if (!pendingQuery || pendingSent.current) return;
    pendingSent.current = true;
    (async () => {
      const headers = await authHeaders();
      console.log(`[DupMsgDebug] pending APPEND firing inst=${instanceId.current}`);
      append({ role: "user", content: pendingQuery }, { headers });
    })();
  }, [pendingQuery, append, authHeaders]);

  useEffect(() => {
    if (messages.length !== prevCount.current) {
      prevCount.current = messages.length;
      console.log(
        `[DupMsgDebug] messages count=${messages.length} roles=[${messages
          .map((m) => m.role)
          .join(",")}] inst=${instanceId.current}`
      );
    }
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = `${ta.scrollHeight}px`;
    }
  }, [input]);

  const onSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || busy) return;
    handleSubmit(undefined, { headers: await authHeaders() });
  };

  const onRegenerate = async () => {
    if (busy) return;
    reload({ headers: await authHeaders() });
  };

  const onCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied to clipboard" });
    } catch {
      toast({ variant: "destructive", title: "Couldn't copy" });
    }
  };

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <div
        className="min-h-0 flex-1 overflow-y-auto"
        style={{ scrollbarGutter: "stable both-edges" }}
      >
        <div className="mx-auto w-full max-w-3xl px-4 py-6">
          <div className="space-y-6">
            {messages.map((message, idx) => {
              const text = messageText(message);
              const isLast = idx === messages.length - 1;

              if (message.role === "user") {
                return (
                  <div key={message.id} className="flex justify-end">
                    <div className="max-w-[80%] whitespace-pre-wrap rounded-3xl bg-muted px-4 py-2.5 text-sm">
                      {text}
                    </div>
                  </div>
                );
              }

              return (
                <div key={message.id} className="space-y-2">
                  <div className="prose prose-sm max-w-none dark:prose-invert prose-p:leading-relaxed prose-pre:bg-muted">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
                    <CourseChips annotations={message.annotations} />
                  </div>
                  {!(isLast && status === "streaming") && (
                    <MessageActions
                      onCopy={() => onCopy(text)}
                      onRegenerate={isLast && !busy ? onRegenerate : undefined}
                    />
                  )}
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
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="shrink-0 bg-background">
        <div className="mx-auto w-full max-w-3xl px-4 pb-3 pt-2">
          <form onSubmit={onSubmit}>
            <div className="flex flex-col rounded-3xl border bg-background shadow-sm transition-colors focus-within:ring-1 focus-within:ring-ring">
              <TextareaExpand
                ref={textareaRef}
                className="max-h-60 w-full resize-none overflow-y-auto border-0 bg-transparent px-4 pt-3 focus-visible:ring-0"
                value={input}
                onChange={handleInputChange}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    onSubmit(e as unknown as React.FormEvent);
                  }
                }}
                placeholder="Message Forty…"
              />
              <div className="flex items-center justify-end px-3 pb-3">
                <Button
                  className="h-9 w-9 rounded-full bg-black p-0 disabled:opacity-50 dark:bg-white"
                  variant="outline"
                  type="submit"
                  disabled={busy || !input.trim()}
                >
                  {busy ? (
                    <Loader2 className="h-5 w-5 animate-spin text-white dark:text-black" />
                  ) : (
                    <ArrowUp className="h-5 w-5 text-white dark:text-black" />
                  )}
                </Button>
              </div>
            </div>
          </form>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Forty can make mistakes. Verify important details.
          </p>
        </div>
      </div>
    </div>
  );
};

function MessageActions({
  onCopy,
  onRegenerate,
}: {
  onCopy: () => void;
  onRegenerate?: () => void;
}) {
  const [vote, setVote] = useState<"up" | "down" | null>(null);
  return (
    <div className="flex items-center gap-0.5 text-muted-foreground">
      <ActionButton label="Copy" onClick={onCopy}>
        <Copy className="h-4 w-4" />
      </ActionButton>
      <ActionButton
        label="Good response"
        active={vote === "up"}
        onClick={() => setVote((v) => (v === "up" ? null : "up"))}
      >
        <ThumbsUp className="h-4 w-4" />
      </ActionButton>
      <ActionButton
        label="Bad response"
        active={vote === "down"}
        onClick={() => setVote((v) => (v === "down" ? null : "down"))}
      >
        <ThumbsDown className="h-4 w-4" />
      </ActionButton>
      {onRegenerate && (
        <ActionButton label="Regenerate" onClick={onRegenerate}>
          <RefreshCw className="h-4 w-4" />
        </ActionButton>
      )}
    </div>
  );
}

function ActionButton({
  children,
  label,
  onClick,
  active,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-md p-1.5 transition-colors hover:bg-muted hover:text-foreground",
        active && "text-foreground"
      )}
    >
      {children}
    </button>
  );
}

export default Conversation;

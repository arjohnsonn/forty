"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { TextareaExpand } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Loader2, ArrowUp, Copy, RefreshCw, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/hooks/use-toast";
import { useChat } from "@ai-sdk/react";
import type { Message } from "ai";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { createClient } from "@/utils/supabase/client";
import CourseChips from "@/components/CourseChips";
import { buildCourseTime, rehypeCourseTime, makeCourseTimeComponents } from "@/lib/rehype-course-time";
import { messageText, deriveTitle } from "@/lib/conversations";

type ConversationProps = {
  chatId: string;
  initialMessages: Message[];
  /** First user message awaiting a response (new chat or a prior unanswered turn). */
  pendingQuery?: string;
  /** Custom title (rename); when absent the title is derived from the first message. */
  initialTitle?: string;
};

const Conversation: React.FC<ConversationProps> = ({
  chatId,
  initialMessages,
  pendingQuery,
  initialTitle,
}) => {
  const { toast } = useToast();
  const router = useRouter();
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
  const busy = status === "submitted" || status === "streaming";
  // Keep "Thinking…" until the assistant message has text (annotations arrive before the first token).
  const lastMessage = messages[messages.length - 1];
  const awaitingText =
    busy && (lastMessage?.role !== "assistant" || messageText(lastMessage).trim() === "");

  const [title, setTitle] = useState(initialTitle);
  const [renaming, setRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const displayTitle = title?.trim() || deriveTitle(messages);

  const handleRename = async () => {
    const next = draftTitle.trim();
    setRenaming(false);
    if (!next || next === displayTitle) return;
    setTitle(next);
    window.dispatchEvent(new CustomEvent("forty:rename", { detail: { id: chatId, title: next } }));
    const { error } = await supabase.from("conversations").update({ title: next }).eq("id", chatId);
    if (error) toast({ variant: "destructive", title: "Couldn't rename chat" });
  };

  const handleDelete = async () => {
    setConfirmingDelete(false);
    const { error } = await supabase.from("conversations").update({ deleted: true }).eq("id", chatId);
    if (error) {
      toast({ variant: "destructive", title: "Couldn't delete chat" });
      return;
    }
    // Event resets the in-place landing view (router desynced); push navigates the real route.
    window.dispatchEvent(new CustomEvent("forty:deleted", { detail: { id: chatId } }));
    router.push("/");
  };

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
    if (!pendingQuery || pendingSent.current) return;
    pendingSent.current = true;
    (async () => {
      const headers = await authHeaders();
      append({ role: "user", content: pendingQuery }, { headers });
    })();
  }, [pendingQuery, append, authHeaders]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Reflect a rename done elsewhere (e.g. the sidebar's 3-dot menu) in the header title.
  useEffect(() => {
    const onRename = (e: Event) => {
      const { id, title: next } = (e as CustomEvent<{ id: string; title: string }>).detail;
      if (id === chatId) setTitle(next);
    };
    window.addEventListener("forty:rename", onRename);
    return () => window.removeEventListener("forty:rename", onRename);
  }, [chatId]);

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
    <div className="relative flex min-h-0 w-full flex-1 flex-col">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10">
        <div className="flex items-center justify-between gap-2 bg-background pb-4 pl-14 pr-3 pt-5">
          <h2 className="truncate text-lg font-semibold text-foreground">{displayTitle}</h2>
          <DropdownMenu>
            <DropdownMenuTrigger className="pointer-events-auto shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none">
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => {
                  setDraftTitle(displayTitle);
                  setRenaming(true);
                }}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setConfirmingDelete(true)}
                className="text-red-500 focus:bg-red-500/10 focus:text-red-500"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="h-8 bg-gradient-to-b from-background to-transparent" />
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto"
        style={{ scrollbarGutter: "stable both-edges" }}
      >
        <div className="mx-auto w-full max-w-3xl px-4 pb-6 pt-24">
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
                <AssistantMessage
                  key={message.id}
                  message={message}
                  streaming={isLast && status === "streaming"}
                  showActions={!(isLast && status === "streaming")}
                  onCopy={() => onCopy(text)}
                  onRegenerate={isLast && !busy ? onRegenerate : undefined}
                />
              );
            })}

            {awaitingText && (
              <div className="flex items-center gap-2 text-sm font-medium">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="shimmer-text">Thinking…</span>
              </div>
            )}
          </div>
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="shrink-0 bg-background">
        <div className="mx-auto w-full max-w-3xl px-4 pb-3 pt-2">
          <form onSubmit={onSubmit}>
            <div className="flex items-end gap-2 rounded-3xl border bg-background py-1.5 pl-4 pr-2 shadow-sm transition-colors focus-within:ring-1 focus-within:ring-ring">
              <TextareaExpand
                ref={textareaRef}
                rows={1}
                className="max-h-60 min-h-0 flex-1 resize-none self-center overflow-y-auto border-0 bg-transparent px-0 py-2 focus-visible:ring-0"
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
              <Button
                className="h-9 w-9 shrink-0 rounded-full border-transparent bg-texas p-0 hover:bg-texas/90 disabled:opacity-50"
                variant="outline"
                type="submit"
                disabled={busy || !input.trim()}
              >
                {busy ? (
                  <Loader2 className="h-5 w-5 animate-spin text-white" />
                ) : (
                  <ArrowUp className="h-5 w-5 text-white" />
                )}
              </Button>
            </div>
          </form>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Forty can make mistakes. Verify important details.
          </p>
        </div>
      </div>

      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename chat</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleRename();
              }
            }}
            placeholder="Chat name"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRenaming(false)}>
              Cancel
            </Button>
            <Button onClick={handleRename} disabled={!draftTitle.trim()}>
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete chat?</DialogTitle>
            <DialogDescription>
              This permanently removes “{displayTitle}”. This can’t be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmingDelete(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

type MdRehypePlugins = React.ComponentProps<typeof ReactMarkdown>["rehypePlugins"];

function AssistantMessage({
  message,
  streaming,
  showActions,
  onCopy,
  onRegenerate,
}: {
  message: Message;
  streaming: boolean;
  showActions: boolean;
  onCopy: () => void;
  onRegenerate?: () => void;
}) {
  const text = messageText(message);
  const { matches, sectionByKey } = useMemo(
    () => buildCourseTime(message.annotations),
    [message.annotations]
  );
  // Defer the inline (+) until streaming finishes (avoids flicker + partial-time matches).
  const components = useMemo(
    () => (streaming ? undefined : makeCourseTimeComponents(sectionByKey)),
    [streaming, sectionByKey]
  );
  const rehypePlugins = useMemo<MdRehypePlugins>(
    () => (streaming ? [] : [[rehypeCourseTime, { matches }]]),
    [streaming, matches]
  );

  return (
    <div className="space-y-2">
      <div className="prose prose-sm max-w-none dark:prose-invert prose-p:leading-relaxed prose-pre:bg-muted">
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={rehypePlugins} components={components}>
          {text}
        </ReactMarkdown>
        {text.trim().length > 0 && <CourseChips annotations={message.annotations} />}
      </div>
      {showActions && <MessageActions onCopy={onCopy} onRegenerate={onRegenerate} />}
    </div>
  );
}

function MessageActions({
  onCopy,
  onRegenerate,
}: {
  onCopy: () => void;
  onRegenerate?: () => void;
}) {
  return (
    <div className="flex items-center gap-0.5 text-muted-foreground">
      <ActionButton label="Copy" onClick={onCopy}>
        <Copy className="h-4 w-4" />
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
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="rounded-md p-1.5 transition-colors hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}

export default Conversation;

import type { Message } from "ai";

type RawPart = { type?: string; text?: string };
type RawMessage = {
  id?: string;
  role?: string;
  content?: string;
  parts?: RawPart[];
  annotations?: unknown[];
};

/** Flatten a message's text from `parts` (live messages) or `content` (hydrated from DB). */
export function messageText(m: { parts?: RawPart[]; content?: string }): string {
  const fromParts = Array.isArray(m.parts)
    ? m.parts.filter((p) => p?.type === "text").map((p) => p?.text ?? "").join("")
    : "";
  return fromParts || m.content || "";
}

/**
 * The Worker stores the message array as a JSON string in `conversations.messages`.
 * Coerce it back into `useChat`-compatible messages, guaranteeing both `content`
 * and `parts` so either render path works.
 */
export function parseMessages(raw: unknown): Message[] {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];

  return value
    .filter((m): m is RawMessage => !!m && typeof m === "object")
    .map((m, i) => {
      const role =
        m.role === "assistant" || m.role === "system" ? m.role : "user";
      const content = messageText(m);
      const parts =
        Array.isArray(m.parts) && m.parts.length
          ? m.parts
          : [{ type: "text", text: content }];
      return {
        id: m.id ?? `m-${i}`,
        role,
        content,
        parts,
        annotations: m.annotations,
      } as unknown as Message;
    });
}

/** Sidebar/title text derived from the first user message. */
export function deriveTitle(messages: Message[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  const text = firstUser ? messageText(firstUser) : "";
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "New chat";
  return clean.length > 48 ? `${clean.slice(0, 48).trimEnd()}…` : clean;
}

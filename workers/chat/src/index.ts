import { createClient } from "@supabase/supabase-js";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import {
  appendResponseMessages,
  createDataStreamResponse,
  createIdGenerator,
  streamText,
  type CoreMessage,
} from "ai";

// Cloudflare's native rate-limiting binding (configured in wrangler.jsonc).
interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  GOOGLE_GENERATIVE_AI_API_KEY: string;
  GUEST_RATE_LIMITER: RateLimit;
  ALLOWED_ORIGINS?: string;
  MATCH_THRESHOLD?: string;
}

// Same model + dimension as scripts/embed.ts, or query and doc vectors won't match.
const EMBED_MODEL = "models/gemini-embedding-001";
const EMBED_DIM = 768;

const normalize = (v: number[]) => {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
};

/** Embed the user query with Gemini (RETRIEVAL_QUERY), L2-normalized to match the stored vectors. */
async function embedQuery(text: string, apiKey: string): Promise<number[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${EMBED_MODEL}:embedContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: EMBED_MODEL,
        content: { parts: [{ text }] },
        taskType: "RETRIEVAL_QUERY",
        outputDimensionality: EMBED_DIM,
      }),
    },
  );
  if (!res.ok)
    throw new Error(
      `Embedding request failed: ${res.status} ${await res.text()}`,
    );
  const data = (await res.json()) as { embedding: { values: number[] } };
  return normalize(data.embedding.values);
}

function corsHeaders(req: Request, env: Env): Record<string, string> {
  const allowed = (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const origin = req.headers.get("Origin") ?? "";
  const allowOrigin =
    allowed.length === 0 ? "*" : allowed.includes(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers":
      "Authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

const errorJson = (
  cors: Record<string, string>,
  status: number,
  name: string,
  message: string,
) =>
  new Response(JSON.stringify({ error: { name, message } }), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

const SYSTEM_PROMPT =
  `You are a course-advising assistant for UT Austin's Fall 2026 registration. ` +
  `Answer using only the "Sections" data provided in the conversation. Each section includes the course, ` +
  `instructors, meeting schedule, instruction mode, the historical course-wide grade distribution (grade_data), ` +
  `per-professor grade distributions (instructor_grades), and past course evaluations (evaluations, with ` +
  `courseRating and instructorRating out of 5). Grade fields are counts of A/B/C/D/F/Other. ` +
  `Instructor names in the structured fields are "LAST, FIRST" (e.g. "LEWIS, CHARLTON N") while the summary ` +
  `prose uses "First Last" (e.g. "Charlton N Lewis") — treat them as the same person when matching a query. ` +
  `instructor_grades covers every instructor of a section, but evaluations may exist for only some of them; ` +
  `if a professor has no evaluation entry, cite only their grade distribution rather than inventing ratings. ` +
  `Cite concrete grade percentages and ratings when relevant. Do not mention course enrollment status ` +
  `(open, closed, waitlisted) — it is not provided and changes over time. If the provided sections do not ` +
  `contain the answer, say so instead of guessing.`;

export default {
  async fetch(
    req: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const cors = corsHeaders(req, env);
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    if (req.method !== "POST")
      return new Response("Method Not Allowed", { status: 405, headers: cors });

    if (
      !env.SUPABASE_URL ||
      !env.SUPABASE_ANON_KEY ||
      !env.GOOGLE_GENERATIVE_AI_API_KEY
    ) {
      return errorJson(
        cors,
        500,
        "Config Error",
        "Worker is missing required secrets — run `wrangler secret put`.",
      );
    }

    try {
      const authorization = req.headers.get("Authorization");
      if (!authorization)
        return errorJson(
          cors,
          401,
          "Request Error",
          "Missing authorization header",
        );
      const jwtToken = authorization.split(" ")[1] ?? "";

      const ip =
        req.headers.get("cf-connecting-ip") ??
        req.headers.get("x-forwarded-for") ??
        "unknown";

      const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false },
      });

      const {
        data: { user },
      } = await supabase.auth.getUser(jwtToken);

      // Rate limit guests only (logged-in users are unlimited) via Cloudflare's native limiter.
      if (!user && env.GUEST_RATE_LIMITER) {
        const { success } = await env.GUEST_RATE_LIMITER.limit({ key: ip });
        if (!success) {
          return errorJson(
            cors,
            429,
            "Rate Limit Error",
            "Too many requests — please slow down or sign in.",
          );
        }
      }

      let body: { chatId?: string; messages?: any[] };
      try {
        body = (await req.json()) as typeof body;
      } catch {
        return errorJson(cors, 400, "Request Error", "Invalid JSON body.");
      }
      const { chatId, messages } = body;
      if (!Array.isArray(messages) || messages.length === 0) {
        return errorJson(
          cors,
          400,
          "Request Error",
          "Missing 'messages' in body.",
        );
      }
      // useChat POSTs the full messages array; embed the latest user message.
      const lastUser = [...messages].reverse().find((m) => m?.role === "user");
      const message =
        (typeof lastUser?.content === "string" && lastUser.content.trim()) ||
        (Array.isArray(lastUser?.parts)
          ? lastUser.parts
              .filter((p: any) => p?.type === "text")
              .map((p: any) => p.text)
              .join(" ")
              .trim()
          : "");
      if (!message)
        return errorJson(
          cors,
          400,
          "Request Error",
          "No user message to answer.",
        );

      let embedding: number[];
      try {
        embedding = await embedQuery(message, env.GOOGLE_GENERATIVE_AI_API_KEY);
      } catch (e) {
        console.error(e);
        return errorJson(
          cors,
          500,
          "Embedding Error",
          "Failed to embed the query, please try again.",
        );
      }

      const matchThreshold = env.MATCH_THRESHOLD
        ? Number(env.MATCH_THRESHOLD)
        : 0.5;
      const { data: sections, error: matchError } = await supabase
        .rpc("match_sections_detailed", {
          embedding: JSON.stringify(embedding),
          match_threshold: matchThreshold,
        })
        .limit(5);

      if (matchError) {
        console.error(matchError);
        return errorJson(
          cors,
          500,
          "Internal Server Error",
          "Error finding sections, please try again.",
        );
      }

      // `status` (waitlisted/open/closed) is point-in-time and can't be updated
      // live, so drop it before it reaches the model or the UI chips.
      const cleanSections = (sections ?? []).map((s: Record<string, unknown>) => {
        const { status, ...rest } = s;
        return rest;
      });

      const injectedSections =
        cleanSections.length > 0
          ? JSON.stringify(cleanSections)
          : "No documents found";

      const completionMessages: CoreMessage[] = [
        { role: "user", content: `Sections:\n${injectedSections}` },
        ...messages,
      ];

      const google = createGoogleGenerativeAI({
        apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY,
      });

      return createDataStreamResponse({
        headers: cors,
        // Attach retrieved sections for the UI's course chips (read via message.annotations).
        execute: (dataStream) => {
          if (cleanSections.length > 0) {
            dataStream.writeMessageAnnotation({
              type: "courses",
              sections: cleanSections,
            } as any);
          }
          const result = streamText({
            model: google("gemini-2.5-flash"),
            system: SYSTEM_PROMPT,
            messages: completionMessages,
            temperature: 0.3,
            maxTokens: 4096,
            experimental_generateMessageId: createIdGenerator({
              prefix: "msgs",
              size: 16,
            }),
            async onFinish({ response }) {
              // Only logged-in users persist conversations.
              if (!user || !chatId) return;
              const saved = appendResponseMessages({
                messages: messages as any,
                responseMessages: response.messages,
              });
              // Re-attach the annotation (not in response.messages) so reloads keep the chips.
              const last = saved[saved.length - 1] as any;
              if (last && cleanSections.length > 0) {
                last.annotations = [{ type: "courses", sections: cleanSections }];
              }
              const { error } = await supabase
                .from("conversations")
                .update({ messages: JSON.stringify(saved) })
                .eq("id", chatId);
              if (error) console.error("Error saving convo:", error);
            },
            async onError(error) {
              console.error("Error:", error);
            },
          });
          result.mergeIntoDataStream(dataStream, { sendSources: true });
        },
        onError: (error) => {
          console.error("Stream error:", error);
          return "Something went wrong generating the response. Please try again.";
        },
      });
    } catch (err) {
      console.error("Worker error:", err);
      return errorJson(
        cors,
        500,
        "Worker Error",
        err instanceof Error ? err.message : String(err),
      );
    }
  },
};

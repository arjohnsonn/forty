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
  `Answer using only the "Sections" data provided in the conversation. Each entry is one course; it may be ` +
  `offered as several sections (course_sections, each with its own instructors, meeting times, and register ` +
  `link) — list them when the user asks about times or which section to take. Each entry also includes the course, ` +
  `instructors, meeting schedule, instruction mode, the historical course-wide grade distribution (grade_data), ` +
  `per-professor grade distributions (instructor_grades), the grade distribution broken down by semester ` +
  `(semester_grades, an array of { semester, grades } from Fall 2020 onward — use it to describe trends over ` +
  `time, e.g. whether a course has gotten harder), and past course evaluations (evaluations, with ` +
  `courseRating and instructorRating out of 5). Grade fields are counts of A/B/C/D/F/Other. ` +
  `Instructor names in the structured fields are "LAST, FIRST" (e.g. "LEWIS, CHARLTON N") while the summary ` +
  `prose uses "First Last" (e.g. "Charlton N Lewis") — treat them as the same person when matching a query. ` +
  `instructor_grades covers every instructor of a section, but evaluations may exist for only some of them; ` +
  `if a professor has no evaluation entry, cite only their grade distribution rather than inventing ratings. ` +
  `Course numbers encode the course: the first digit is the semester credit-hour value (e.g. 3 = a 3-credit ` +
  `course, 4 = a 4-credit course), and the second and third digits give the level — 01–19 is lower-division ` +
  `(freshman-level), 20–79 is upper-division (sophomore–senior-level), and 80–99 is graduate-level. ` +
  `Use this to answer questions about credit hours or course level (e.g. "C S 314" is a 3-credit upper-division course). ` +
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
      // Over-fetch, then keep one section per course — a course with several sections (same summary)
      // would otherwise fill the results with duplicates and crowd out other courses.
      const { data: sections, error: matchError } = await supabase
        .rpc("match_sections_detailed", {
          embedding: JSON.stringify(embedding),
          match_threshold: matchThreshold,
        })
        .limit(25);

      if (matchError) {
        console.error(matchError);
        return errorJson(
          cors,
          500,
          "Internal Server Error",
          "Error finding sections, please try again.",
        );
      }

      // Group by course code ("C S 378") so different sections — and different topics of one number
      // (the many "C S 378" topics) — collapse to one course. The representative keeps a
      // `course_sections` list (every section's times/instructor/register link) and merged
      // per-professor grades + evaluations across the sections. `status` (waitlisted/open/closed) is
      // point-in-time and can't be kept live, so it's dropped before reaching the model or UI.
      const courseCodeOf = (header: string) =>
        header.match(/^(.+?\s\d{1,3}[A-Z]*)(?:\s|$)/)?.[1] ?? header;
      const MAX_COURSES = 6;
      // Cosine-similarity margin below the top match. A specific-course question makes one course
      // match far better than the rest, so the others fall outside the margin and get dropped.
      const MATCH_MARGIN = 0.08;
      const groups = new Map<string, Record<string, unknown>[]>();
      const order: string[] = [];
      for (const s of (sections ?? []) as Record<string, unknown>[]) {
        const code = courseCodeOf(s.course_header as string);
        if (!groups.has(code)) {
          groups.set(code, []);
          order.push(code);
        }
        groups.get(code)!.push(s);
      }
      const ranked = order.slice(0, MAX_COURSES).map((code) => {
        const group = groups.get(code)!;
        const { status: _status, similarity, ...rep } = group[0]!;
        const igByInstructor = new Map<string, unknown>();
        const evByKey = new Map<string, any>();
        for (const g of group) {
          for (const ig of (g.instructor_grades as any[]) ?? [])
            if (!igByInstructor.has(ig.instructor)) igByInstructor.set(ig.instructor, ig);
          for (const e of (g.evaluations as any[]) ?? []) {
            const k = e.instructor ?? e.cesLink;
            if (k && !evByKey.has(k)) evByKey.set(k, e);
          }
        }
        return {
          similarity: typeof similarity === "number" ? similarity : 0,
          section: {
            ...rep,
            instructor_grades: igByInstructor.size ? [...igByInstructor.values()] : rep.instructor_grades,
            evaluations: evByKey.size ? [...evByKey.values()] : rep.evaluations,
            course_sections: group.map((g) => ({
              section_id: g.section_id,
              instructors: g.instructors,
              instruction_mode: g.instruction_mode,
              register_url: g.register_url,
              schedule_days: g.schedule_days,
              schedule_hours: g.schedule_hours,
              schedule_location: g.schedule_location,
            })),
          },
        };
      });
      // If the question names a specific course (its code appears in the query, e.g. "cs 439" ->
      // "cs439"), show ONLY that course. Otherwise (vague/browse queries) keep the top course plus
      // any others within the similarity margin.
      const norm = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, "");
      const queryNorm = norm(message);
      const explicit = ranked.filter((r) => {
        const header = (r.section as Record<string, unknown>).course_header as string;
        const code = norm(courseCodeOf(header));
        return code.length >= 4 && queryNorm.includes(code);
      });
      let chosen = explicit;
      if (chosen.length === 0) {
        const topSimilarity = ranked[0]?.similarity ?? 0;
        chosen = ranked.filter((r, i) => i === 0 || topSimilarity - r.similarity <= MATCH_MARGIN);
      }
      // Only surface courses when the question is actually about courses. Meta/conversational
      // questions ("what did I just ask") top out around 0.60 similarity; real course queries are
      // ~0.64+, so below this we show no chips and give the model no sections.
      const COURSE_MIN_SIMILARITY = 0.62;
      const aboutCourses = (ranked[0]?.similarity ?? 0) >= COURSE_MIN_SIMILARITY;
      const cleanSections = aboutCourses ? chosen.map((r) => r.section) : [];

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

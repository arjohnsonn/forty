// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js";
import { Database } from "../../../types/database.ts";

import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { google } from "@ai-sdk/google";
import {
  appendResponseMessages,
  CoreMessage,
  createIdGenerator,
  streamText,
} from "ai";

// types for rate limit duration
type Unit = "ms" | "s" | "m" | "h" | "d";
type Duration = `${number} ${Unit}` | `${number}${Unit}`;

// environment variables
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
const redisUrl = Deno.env.get("UPSTASH_REDIS_REST_URL");
const redisToken = Deno.env.get("UPSTASH_REDIS_REST_TOKEN");

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "Authorization, x-client-info, apikey, content-type",
};

const embedding_model = new Supabase.ai.Session("gte-small");

const checkRateLimit = async (
  tokens: number,
  window: Duration,
  req: Request,
  ip: string,
  authorization: string,
) => {
  // initialize redis and rate limit client
  const redis = new Redis({
    url: redisUrl,
    token: redisToken,
  });

  const ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.fixedWindow(tokens, window), // token requests every window
    analytics: true,
  });

  const userAgent = req.headers.get("user-agent") || "unknown";

  // Create a composite key for rate limiting
  // If authorization exists, use token hash + IP
  // Otherwise, use IP + user agent
  const rateLimitKey = authorization
    ? `${ip}:${authorization.split(" ")[1]}`
    : `${ip}:${userAgent}`;

  // Check if the request is rate limited
  return await ratelimit.limit(rateLimitKey, {
    geo: {
      country: req.headers.get("cf-ipcountry")!,
      region: req.headers.get("cf-ipregion")!,
      city: req.headers.get("cf-ipcity")!,
      ip: ip,
    },
    ip: ip,
    userAgent: userAgent,
    country: req.headers.get("cf-ipcountry")!,
  });
};

Deno.serve(async (req) => {
  // Check for CORS and only allow POST requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  } else if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // Get supabase authorization header
  const authorization = req.headers.get("Authorization");
  if (!authorization) {
    return new Response(
      JSON.stringify({ error: `No authorization header passed` }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // Check for ip for rate limiting
  const ip = req.headers.get("x-forwarded-for") ||
    req.headers.get("cf-connecting-ip");
  if (!ip) {
    return new Response(
      JSON.stringify({ error: `No IP address found` }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // rate limit
  const {
    success,
    reset,
    reason,
  } = await checkRateLimit(5, "12h", req, ip, authorization);

  // block rate limited request
  if (!success) {
    return new Response(
      JSON.stringify({
        error: `Rate limit exceeded. Try again on ${
          new Date(reset).toString()
        }.`,
        reason: reason,
      }),
      {
        status: 429,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // load supabase env
  if (!supabaseUrl || !supabaseAnonKey) {
    return new Response(
      JSON.stringify({
        error: "Missing environment variables.",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  if (!embedding_model) {
    console.error("Unable to load embedding model");
    return new Response(
      JSON.stringify({ error: `Embedding model is unavailable` }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        authorization,
      },
    },
    auth: {
      persistSession: false,
    },
  });

  // fetch request chat prompt params
  const { chatId, message, messages } = await req.json();

  // generate embedding from current user prompt
  const embedding = JSON.stringify(
    await embedding_model.run(message, {
      mean_pool: true,
      normalize: true,
    }),
  );

  // RAG search
  const { data: sections, error: matchError } = await supabase
    .rpc("match_sections", {
      embedding,
      match_threshold: 0.8,
    })
    .select("summary")
    .limit(5);

  if (matchError) {
    console.error(matchError);

    return new Response(
      JSON.stringify({
        error: "Error finding sections, please try again.",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // Inject sections into user prompt
  const injectedSections = sections && sections.length > 0
    ? JSON.stringify(sections)
    : "No documents found";

  const completionMessages: CoreMessage[] = [
    {
      role: "user",
      content: `
          Sections:
          ${injectedSections}
        `,
    },
    ...messages,
  ];

  // const openai = createOpenAI({
  //   apiKey: OPENAI_API_KEY,
  // });

  const systemMessages = ``;

  // Send injected prompt to model and stream response back
  const result = streamText({
    model: google("gemini-2.5-flash-preview-04-17"),
    // tools: {
    //   web_search_preview: openai.tools.webSearchPreview(),
    // },
    system: systemMessages,
    messages: completionMessages,
    temperature: 1,
    maxTokens: 4096,
    experimental_generateMessageId: createIdGenerator({
      prefix: "msgs",
      size: 16,
    }),
    async onFinish({ response }) {
      // check if user is logged in to save convo
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return;
      }

      // save the conversation to the database
      const { error } = await supabase
        .from("conversations")
        .update({
          messages: JSON.stringify(appendResponseMessages({
            messages,
            responseMessages: response.messages,
          })),
        })
        .eq("id", chatId);

      if (error) {
        console.error("Error saving convo:", error);
      }
    },
    async onError(error) {
      await console.error("Error:", error);
    },
  });

  result.consumeStream();

  return result.toDataStreamResponse({
    headers: corsHeaders,
    sendSources: true,
  });
});

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/chat' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/

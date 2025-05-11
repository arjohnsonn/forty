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
  ip: string,
  userAgent: string,
  token: string,
) => {
  // initialize redis and rate limit client
  const redis = new Redis({
    url: redisUrl,
    token: redisToken,
  });

  const ratelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.fixedWindow(tokens, window),
    analytics: true,
  });

  // Create a composite key for rate limiting
  // If authorization exists, use token hash + IP
  // Otherwise, use IP + user agent
  const rateLimitKey = token ? `${ip}:${token}` : `${ip}:${userAgent}`;

  // Check if the request is rate limited
  return await ratelimit.limit(rateLimitKey, {
    ip: ip,
    userAgent: userAgent,
  });
};

Deno.serve(async (req) => {
  // Check for CORS and only allow POST requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  } else if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  if (!embedding_model) {
    console.error("Unable to load embedding model");
    return new Response(
      JSON.stringify({
        error: {
          name: "Embedding Error",
          message: "Embedding model is unavailable",
        },
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // Get ip header for rate limiting identiifcation
  const ip = req.headers.get("x-forwarded-for") ||
    req.headers.get("cf-connecting-ip");
  if (!ip) {
    return new Response(
      JSON.stringify({
        error: {
          name: "Request Error",
          message: "Missing IP header",
        },
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // Get userAgent for rate limiting identification
  const userAgent = req.headers.get("user-agent") || "unknown";

  // Get supabase authorization header
  const authorization = req.headers.get("Authorization");
  if (!authorization) {
    return new Response(
      JSON.stringify({
        error: {
          name: "Request Error",
          message: "Missing authorization header",
        },
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
  const jwtToken = authorization.split(" ")[1];

  // check supabase env variables
  if (!supabaseUrl || !supabaseAnonKey) {
    return new Response(
      JSON.stringify({
        error: {
          name: "Internal Server Error",
          message: "Missing environment variables",
        },
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // init supabase client
  const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        ...corsHeaders,
        Authorization: jwtToken,
      },
    },
    auth: {
      persistSession: false,
    },
  });

  // get user from supabase
  const { data: { user } } = await supabase.auth.getUser(jwtToken);

  // only rate limit guest users, unlimited chat api requests for logged in users for now
  if (!user) {
    // rate limit
    const {
      success,
      reset,
      reason,
    } = await checkRateLimit(5, "12h", ip, userAgent, jwtToken);

    // block rate limited request
    if (!success) {
      return new Response(
        JSON.stringify({
          error: {
            name: "Rate Limit Error",
            message: `Rate limit exceeded. Try again on ${
              new Date(reset).toLocaleString()
            }.`,
            reason: reason,
          },
        }),
        {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
  }

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
        error: {
          name: "Internal Server Error",
          message: "Error finding sections, please try again.",
        },
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
      // only allow logged in users to save conversations
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

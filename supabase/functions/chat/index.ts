// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js";
import { Database } from "../../../types/database.ts";

import { createOpenAI } from "@ai-sdk/openai";
import {
  appendResponseMessages,
  CoreMessage,
  createIdGenerator,
  streamText,
} from "ai";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const embedding_model = new Supabase.ai.Session("gte-small");

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  } else if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
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
  const output = await embedding_model.run(message, {
    mean_pool: true,
    normalize: true,
  }) as number[];

  const embedding = JSON.stringify(output);

  // RAG search
  const { data: sections, error: matchError } = await supabase
    .rpc("match_sections", {
      embedding,
      match_threshold: 0.8,
    })
    .select("*")
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

  const openai = createOpenAI({
    apiKey: OPENAI_API_KEY,
  });

  const systemMessages = ``;

  // Send injected prompt to model and stream response back
  const result = streamText({
    model: openai.responses(
      "gpt-3.5-turbo-0125",
    ),
    tools: {
      web_search_preview: openai.tools.webSearchPreview(),
    },
    system: systemMessages,
    messages: completionMessages,
    temperature: 1,
    maxTokens: 4096,
    experimental_generateMessageId: createIdGenerator({
      prefix: "msgs",
      size: 16,
    }),
    async onFinish({ response }: any) {
      const { error } = await supabase
        .from("conversations")
        .update({
          messages: appendResponseMessages({
            messages,
            responseMessages: response.messages,
          }),
        })
        .eq("id", chatId);

      if (error) {
        console.error("Error updating chat:", error);
      }
    },
    async onError(error: any) {
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

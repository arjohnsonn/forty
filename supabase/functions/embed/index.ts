// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js";
import { Database } from "../../../types/database.ts";

const model = new Supabase.ai.Session("gte-small");

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

Deno.serve(async (req) => {
  if (req.method !== "POST") {
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

  if (!model) {
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

  // Get parameters from request
  /*
   * ids: the ids of rows inserted on trigger
   * table: the table inserted on trigger
   * contentColumn: the column of text to embed
   * embeddingColumn: the column of embedding to insert resulting embed
   */
  const { ids, table, contentColumn, embeddingColumn } = await req.json();

  const { data: rows, error: selectError } = await supabase
    .from(table)
    .select(`id, ${contentColumn}` as "*")
    .in("id", ids)
    .is(embeddingColumn, null);

  if (selectError) {
    return new Response(JSON.stringify({ error: selectError }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // generate an embedding for each row
  for (const row of rows) {
    const { id, [contentColumn]: content } = row;

    if (!content) {
      console.error(
        `No content available in column '${contentColumn}. Skipping...`,
      );
      continue;
    }

    // embedding result
    const output = await model.run(content, {
      mean_pool: true,
      normalize: true,
    }) as number[];

    const embedding = JSON.stringify(output);

    // push embedding result into db
    const { error } = await supabase
      .from(table)
      .update({
        [embeddingColumn]: embedding,
      })
      .eq("id", id);

    if (error) {
      console.error(
        `Failed to save embedding on '${table}' table with id ${id}`,
      );
    }

    console.log(
      `Generated embedding ${
        JSON.stringify({
          table,
          id,
          contentColumn,
          embeddingColumn,
        })
      }`,
    );
  }

  // Success response
  return new Response(null, {
    status: 204,
    headers: { "Content-Type": "application/json" },
  });
});

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/embed' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/

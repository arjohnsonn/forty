// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js";
import { Database } from "../../../types/database.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // load supabase env
  if (!supabaseUrl || !supabaseKey) {
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

  const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
    global: {
      headers: {
        authorization,
      },
    },
    auth: {
      persistSession: false,
    },
  });

  // 1) get term from header
  const termName = req.headers.get("x-term")?.trim();
  if (!termName) {
    return new Response("Missing x-term header", { status: 400 });
  }

  // 2) upsert term
  const { data: term, error: termErr } = await supabase
    .from("terms")
    .upsert({ name: termName }, { onConflict: "name" })
    .select("id")
    .single();

  if (termErr || !term) {
    console.error(termErr);
    return new Response("Error upserting term", { status: 500 });
  }

  // 3) parse JSON body
  let coursesArr: Array<{
    courseHeader: string;
    sections: Array<{
      uniqueId: number;
      registerUrl?: string;
      instructors: string[];
      instructionMode?: string;
      status?: string;
      scheduleDays?: string[];
      scheduleHours?: string[];
      scheduleLocation?: string[];
      coreCurriculum?: string[];
    }>;
  }>;
  try {
    coursesArr = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // 4) for each course + section
  for (const { courseHeader, sections } of coursesArr) {
    // upsert course
    const { data: courseData, error: courseErr } = await supabase
      .from("courses")
      .upsert({ course_header: courseHeader }, { onConflict: "course_header" })
      .select("id")
      .single();
    if (courseErr || !courseData) {
      console.error("course upsert error:", courseErr);
      return new Response(`Error upserting course: ${courseErr.message}`, {
        status: 500,
      });
    }
    const courseId = courseData.id;

    // each section
    for (const s of sections) {
      // upsert section
      const { data: secData, error: secErr } = await supabase
        .from("sections")
        .upsert({
          id: s.uniqueId,
          course_id: courseId,
          term_id: term.id,
          register_url: s.registerUrl,
          instruction_mode: s.instructionMode,
          status: s.status,
          schedule_days: s.scheduleDays,
          schedule_hours: s.scheduleHours,
          schedule_location: s.scheduleLocation,
          core_curriculum: s.coreCurriculum,
        }, { onConflict: "id,term_id" })
        .select("id")
        .single();
      if (secErr || !secData) {
        console.error("section upsert error:", secErr);
        continue;
      }
      const sectionId = secData.id;

      // link instructors
      for (const name of s.instructors) {
        // upsert instructor
        const { data: instData, error: instErr } = await supabase
          .from("instructors")
          .upsert({ name }, { onConflict: "name" })
          .select("id")
          .single();
        if (instErr || !instData) {
          console.error("instructor upsert error:", instErr);
          continue;
        }
        const instructorId = instData.id;

        // link section ↔ instructor
        const { error: linkErr } = await supabase
          .from("section_instructors")
          .upsert({
            section_id: sectionId,
            instructor_id: instructorId,
          }, { onConflict: "section_id,instructor_id" });
        if (linkErr) {
          console.error("link error:", linkErr);
        }
      }
    }
  }

  return new Response(
    JSON.stringify({ status: "ok", term_id: term.id }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  // aggregated-courses-small.json example
  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/parse_courses' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --header 'x-term: Fall 2024' \
    --data '@aggregated-courses-small.json'

*/

import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import cliProgress from 'cli-progress';

const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);
const filePath = './courses.json';

async function getOrCreateTerm(termName: string) {
  const { data, error } = await supabase
    .from('terms')
    .upsert({ name: termName })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function getOrCreateInstructor(name: string) {
  // First check if instructor exists
  const { data: existingInstructor } = await supabase
    .from('instructors')
    .select('*')
    .eq('name', name)
    .single();
    
  if (existingInstructor) {
    return existingInstructor;
  }
  
  // If not exists, try to insert it with onConflict handling
  const { data, error } = await supabase
    .from('instructors')
    .upsert({ name }, { 
      onConflict: 'name',
      ignoreDuplicates: true 
    })
    .select()
    .single();
    
  if (error) {
    // If insertion failed, try one more select in case it was created concurrently
    const { data: retryInstructor } = await supabase
      .from('instructors')
      .select('*')
      .eq('name', name)
      .single();
      
    if (retryInstructor) return retryInstructor;
    throw error;
  }
  
  return data;
}

async function main() {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  if (!data || !Array.isArray(data)) {
    console.error("❌ Couldn't read courses.json. Make sure the file exists in the root directory and is valid JSON.");
    return;
  }

  const progress = new cliProgress.SingleBar({
    format: 'Importing [{bar}] {percentage}% | {value}/{total} courses',
    barCompleteChar: '#',
    barIncompleteChar: '.',
    hideCursor: true,
  });

  progress.start(data.length, 0);

  await getOrCreateTerm("Fall 2025");

  for (const course of data) {
    try {
      const { courseHeader, sections } = course;

      const { data: courseRow, error: courseErr } = await supabase
        .from('courses')
        .insert({ course_header: courseHeader })
        .select()
        .single();

      if (courseErr && courseErr.code !== '23505') {
        console.error('Course insert error:', courseErr);
        continue;
      }

      const courseResult = courseRow?.id 
        ? { data: { id: courseRow.id } } 
        : await supabase.from('courses').select('id').eq('course_header', courseHeader).single();
      
      if (!courseResult.data) {
        console.error('Course not found:', courseHeader);
        continue;
      }
      
      const courseId = courseResult.data.id;

      for (const section of sections) {
        const {
          uniqueId,
          registerUrl,
          instructionMode,
          status,
          summary,
          instructors,
          scheduleDays,
          scheduleHours,
          scheduleLocation,
          coreCurriculum,
          cesData,
          gradeData
        } = section;
        
        if (gradeData) {
          delete gradeData.courseHeader;
        }


        const { data: sectionRow, error: sectionErr } = await supabase
          .from('sections')
          .insert({
            id: Number(uniqueId),
            course_id: courseId,
            term_id: 1,
            register_url: registerUrl,
            instruction_mode: instructionMode,
            status,
            summary,
            schedule_days: scheduleDays,
            schedule_hours: scheduleHours,
            schedule_location: scheduleLocation,
            core_curriculum: coreCurriculum,
            grade_data: gradeData ?? null,
          })
          .select()
          .single();
        if (sectionErr) {
          console.error('Section insert error:', sectionErr);
          continue;
        }

        // Link instructors
        for (const inst of instructors) {
          try {
            const instructorRow = await getOrCreateInstructor(inst);
            await supabase.from('section_instructors').upsert({
              section_id: sectionRow.id,
              instructor_id: instructorRow.id,
            });
          } catch (e) {
            console.error('Instructor insert error:', e);
          }
        }

        // CES evaluation (if exists)
        if (cesData) {
          try {
            const mainInstructor = instructors[0];
            const instRow = await getOrCreateInstructor(mainInstructor);

            const { data: evalRow, error: evalErr } = await supabase
              .from('evaluations')
              .insert({
                instructor_id: instRow.id,
                course_header: cesData.courseHeader,
                ces_link: cesData.cesLink,
                course_questions: cesData.courseQuestions,
                instructor_questions: cesData.instructorQuestions,
                course_rating: cesData.courseRating,
                instructor_rating: cesData.instructorRating,
                course_audience: cesData.courseAudience,
                responses_received: cesData.responsesReceived,
                response_rate: Math.round(cesData.responseRate),
              })
              .select()
              .single();

            if (!evalErr) {
              await supabase.from('evaluation_sections').insert({
                evaluation_id: evalRow.id,
                section_id: sectionRow.id,
              });
            } else {
              console.error('Evaluation insert error:', evalErr);
            }
          } catch (e) {
            console.error('Evaluation block error:', e);
          }
        }
      }
    } catch (err) {
      console.error('Unexpected error:', err);
    }

    progress.increment();
  }

  progress.stop();
  console.log('✅ All courses imported.');
}

main().catch(console.error);
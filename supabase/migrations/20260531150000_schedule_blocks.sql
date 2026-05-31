set search_path = public, extensions;

-- User-defined time blocks (lunch, work, commute, …) on a schedule: a jsonb array of
-- { id, label, days:int[], startMin, endMin } (see TimeBlock in lib/courses.ts).
ALTER TABLE public.schedules ADD COLUMN IF NOT EXISTS blocks jsonb NOT NULL DEFAULT '[]'::jsonb;

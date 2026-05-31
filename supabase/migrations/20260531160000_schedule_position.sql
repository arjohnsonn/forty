set search_path = public, extensions;

-- Manual ordering of a user's schedule tabs (drag-to-reorder). Existing rows default to 0 and fall
-- back to created_at order until reordered.
ALTER TABLE public.schedules ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;

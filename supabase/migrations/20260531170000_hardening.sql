set search_path = public, extensions;

-- 1. Lock down reference tables: readable by everyone, writable only via the service role (which
--    bypasses RLS). Previously these had no RLS, so the anon key could modify course/section data.
do $$
declare t text;
begin
  foreach t in array array[
    'courses', 'sections', 'instructors', 'terms',
    'evaluations', 'evaluation_sections', 'section_instructors', 'course_grades'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_public_read', t);
    execute format(
      'create policy %I on public.%I for select to anon, authenticated using (true)',
      t || '_public_read', t
    );
  end loop;
end $$;

-- 2. Atomic time-block mutations (mirror add_section_to_schedule) so concurrent edits can't drop
--    each other via a client read-modify-write of the blocks jsonb array. SECURITY INVOKER keeps
--    schedules RLS in force (a user only mutates their own rows).
create or replace function public.add_block_to_schedule(p_id uuid, p_block jsonb)
returns void language sql security invoker set search_path = public as $$
    update public.schedules
    set blocks = case
            when exists (select 1 from jsonb_array_elements(blocks) e where e->>'id' = p_block->>'id')
                then blocks
                else blocks || jsonb_build_array(p_block)
        end,
        updated_at = now()
    where id = p_id;
$$;

create or replace function public.update_block_in_schedule(p_id uuid, p_block jsonb)
returns void language sql security invoker set search_path = public as $$
    update public.schedules
    set blocks = coalesce((
            select jsonb_agg(case when e->>'id' = p_block->>'id' then p_block else e end)
            from jsonb_array_elements(blocks) e
        ), '[]'::jsonb),
        updated_at = now()
    where id = p_id;
$$;

create or replace function public.remove_block_from_schedule(p_id uuid, p_block_id text)
returns void language sql security invoker set search_path = public as $$
    update public.schedules
    set blocks = coalesce((
            select jsonb_agg(e) from jsonb_array_elements(blocks) e where e->>'id' <> p_block_id
        ), '[]'::jsonb),
        updated_at = now()
    where id = p_id;
$$;

-- 3. Reorder schedule tabs in a single statement (one realtime event instead of N updates).
create or replace function public.set_schedule_positions(p_ids uuid[])
returns void language sql security invoker set search_path = public as $$
    update public.schedules s
    set position = arr.idx, updated_at = now()
    from unnest(p_ids) with ordinality as arr(id, idx)
    where s.id = arr.id;
$$;

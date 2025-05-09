create table public.conversations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users NOT NULL DEFAULT auth.uid(),
    messages jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted BOOLEAN DEFAULT false
);
CREATE INDEX ON public.conversations(user_id);


-- Row Level Level Security Policies
alter table public.conversations enable row level security;
create policy "Individuals can create conversations" on public.conversations 
    for insert to authenticated
    with check ((select auth.uid()) = user_id);

create policy "Individuals can view their conversations" on public.conversations
    for select to authenticated
    using ((select auth.uid()) = user_id);

create policy "Individuals can update their conversations" on public.conversations 
    for update to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

create policy "Individuals can delete their conversations" on public.conversations 
    for delete to authenticated
    using ((select auth.uid()) = user_id);


-- Enable realtime
alter
  publication supabase_realtime add table public.conversations;

-- Legend-State helper to facilitate "Sync only diffs" (changesSince: 'last-sync') mode
-- CREATE OR REPLACE FUNCTION handle_times()
--     RETURNS trigger AS
--     $$
--     BEGIN
--     IF (TG_OP = 'INSERT') THEN
--         NEW.created_at := now();
--         NEW.updated_at := now();
--     ELSEIF (TG_OP = 'UPDATE') THEN
--         NEW.created_at = OLD.created_at;
--         NEW.updated_at = now();
--     END IF;
--     RETURN NEW;
--     END;
--     $$ language plpgsql;

-- CREATE TRIGGER handle_times
--     BEFORE INSERT OR UPDATE ON public.conversations
--     FOR EACH ROW
-- EXECUTE PROCEDURE handle_times();

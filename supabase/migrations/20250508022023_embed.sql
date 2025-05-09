create schema private;
grant usage on schema private to service_role;

-- function to retrieve supabase url
create function private.supabase_url()
returns text
language plpgsql
security definer
set search_path = '' 
as $$
declare
  secret_value text;
begin
  select decrypted_secret into secret_value from vault.decrypted_secrets where name = 'supabase_url';
  return secret_value;
end;
$$;

-- =================================================================================================
-- Course Embeddings
-- =================================================================================================
create function private.embed()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
    content_column text = TG_ARGV[0];
    embedding_column text = TG_ARGV[1];
    batch_size int = case when array_length(TG_ARGV, 1) >= 3 then TG_ARGV[2]::int else 5 end;
    timeout_milliseconds int = case when array_length(TG_ARGV, 1) >= 4 then TG_ARGV[3]::int else 5 * 60 * 1000 end;
    batch_count int = ceiling((select count(*) from inserted) / batch_size::float);
begin
    -- Loop through each batch and invoke an edge function to handle the embedding generation
    for i in 0 .. (batch_count-1) loop
    perform
    net.http_post(
        url := private.supabase_url() || '/functions/v1/embed',
        headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', current_setting('request.headers')::json->>'authorization'
        ),
        body := jsonb_build_object(
        'ids', (select json_agg(ds.id) from (select id from inserted limit batch_size offset i*batch_size) ds),
        'table', TG_TABLE_NAME,
        'contentColumn', content_column,
        'embeddingColumn', embedding_column
        ),
        timeout_milliseconds := timeout_milliseconds
    );
    end loop;

    return null;
end;
$$;

create trigger embed_sections
after insert on public.sections
referencing new table as inserted
for each statement
execute procedure private.embed(summary, embedding);

-- =================================================================================================
-- Match Embeddings Search
-- =================================================================================================
create or replace function public.match_sections(
    embedding vector(384),
    match_threshold float
)
returns setof sections
language plpgsql
set search_path = 'public', 'extensions'
as $$
#variable_conflict use_variable
begin
    return query
    select *
    from public.sections
    where public.sections.embedding <#> embedding < -match_threshold
    order by public.sections.embedding <#> embedding;
end;
$$;

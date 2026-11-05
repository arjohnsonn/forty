-- Schedules belong to one registration term; rows saved before Spring 2027 hold Fall 2026 sections.
alter table public.schedules add column term text;
update public.schedules set term = 'Fall 2026' where term is null;
alter table public.schedules alter column term set not null;
alter table public.schedules alter column term set default 'Spring 2027';

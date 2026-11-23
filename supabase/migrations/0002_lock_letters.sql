-- Letters are reachable only through the web app's secret key, which uses service_role.
-- Publishable keys map to anon or authenticated and receive no table privileges.
-- Row level security stays on, with no policies, so a later grant still returns no rows.

drop policy if exists letters_select on public.letters;
drop policy if exists letters_insert on public.letters;
drop policy if exists letters_update on public.letters;
drop policy if exists letters_delete on public.letters;

alter table public.letters enable row level security;
alter table public.letters force row level security;

revoke all on table public.letters from public, anon, authenticated;
grant select, insert, update, delete on table public.letters to service_role;

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated;

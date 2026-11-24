-- One résumé per account: the original file and the extracted text.
-- file_base64 is the original bytes. The JSON API never returns it.
-- Same lock as letters: row level security with no policies, and no grants for
-- public, anon, or authenticated. The web app reads and writes with the secret key.

create table if not exists public.resumes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  filename text not null default '',
  media_type text not null default '',
  file_base64 text not null default '',
  text text not null default '',
  truncated boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.resumes enable row level security;
alter table public.resumes force row level security;

revoke all on table public.resumes from public, anon, authenticated;
grant select, insert, update, delete on table public.resumes to service_role;

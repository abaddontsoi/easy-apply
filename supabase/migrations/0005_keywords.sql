-- Keywords a person saves from a résumé or job description.
-- hits counts how many generated letters or emails included that keyword.
-- Same lock as letters: row level security with no policies, and no grants for
-- public, anon, or authenticated. The web app reads and writes with the secret key.

create table if not exists public.keywords (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  text text not null,
  normalized text not null,
  hits integer not null default 0,
  created_at timestamptz not null default now(),
  constraint keywords_text_length check (char_length(text) between 1 and 80),
  constraint keywords_normalized_length check (char_length(normalized) between 1 and 80),
  constraint keywords_hits_nonnegative check (hits >= 0),
  constraint keywords_user_normalized_unique unique (user_id, normalized)
);

alter table public.keywords enable row level security;
alter table public.keywords force row level security;

revoke all on table public.keywords from public, anon, authenticated;
grant select, insert, update, delete on table public.keywords to service_role;
grant usage, select on sequence public.keywords_id_seq to service_role;

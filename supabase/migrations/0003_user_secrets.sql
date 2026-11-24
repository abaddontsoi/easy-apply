-- Personal model and Apify keys. The browser never receives these values.
-- Same lock as letters: row level security with no policies, and no grants for
-- public, anon, or authenticated. The web app reads and writes with the secret key.

create table if not exists public.user_secrets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  grok_key text not null default '',
  gemini_key text not null default '',
  apify_token text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.user_secrets enable row level security;
alter table public.user_secrets force row level security;

revoke all on table public.user_secrets from public, anon, authenticated;
grant select, insert, update, delete on table public.user_secrets to service_role;

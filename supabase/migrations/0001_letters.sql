create table if not exists public.letters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  resume text not null,
  job_description text not null,
  company text not null default '',
  role text not null default '',
  hiring_manager text not null default '',
  tone text not null,
  length text not null,
  language text not null,
  format text not null,
  provider text not null,
  subject text not null default '',
  letter text not null default '',
  email text not null default '',
  used_facts jsonb not null default '[]'::jsonb,
  omissions jsonb not null default '[]'::jsonb,
  mode text not null,
  notice text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint letters_provider_check check (provider in ('grok', 'gemini')),
  constraint letters_mode_check check (mode in ('model', 'structured')),
  constraint letters_tone_check check (tone in ('professional', 'warm', 'confident', 'direct')),
  constraint letters_length_check check (length in ('email', 'letter', 'detailed')),
  constraint letters_language_check check (language in ('en', 'zh-Hant')),
  constraint letters_format_check check (format in ('letter', 'email', 'both'))
);

create index if not exists letters_user_updated_idx
  on public.letters (user_id, updated_at desc);

-- The Data API roles cannot read or write this table. The web app uses a secret key
-- (service_role, which bypasses row level security) and checks the signed-in user first.
alter table public.letters enable row level security;
alter table public.letters force row level security;

drop policy if exists letters_select on public.letters;
drop policy if exists letters_insert on public.letters;
drop policy if exists letters_update on public.letters;
drop policy if exists letters_delete on public.letters;

revoke all on table public.letters from public, anon, authenticated;
grant select, insert, update, delete on table public.letters to service_role;

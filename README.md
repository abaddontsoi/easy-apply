# 函箋

A writing desk for cover letters and application emails. A résumé and a target job description become a letter, an email, or both. The prose uses only facts from the résumé. Requirements the résumé does not support are listed beside the draft.

The interface is Traditional Chinese. The letter can be English or Traditional Chinese. Grok (`grok-4.7` on the xAI API) or Gemini (`gemini-3.5-flash-lite`) writes the prose. With neither key set, the app still saves a structured draft built from the résumé and labels it as such. The model call, the empty-reply retry, and a revise-by-instruction pass are specified in [docs/email-generation.md](docs/email-generation.md).

Accounts, résumés, job descriptions, and letters live in Supabase. Nothing is kept in the browser.

## Supabase

1. Create a project.
2. In the SQL editor, run `supabase/migrations/0001_letters.sql`, then `supabase/migrations/0002_lock_letters.sql`, then `supabase/migrations/0003_user_secrets.sql`, then `supabase/migrations/0004_resumes.sql`, then `supabase/migrations/0005_keywords.sql`.
3. Enable email sign-in. Set the Site URL to the Railway URL.
4. In Settings → API Keys, open Publishable and secret keys. Create the publishable key and a secret key used only by this app. Disable the legacy `anon` and `service_role` keys. Do not copy a key that starts with `eyJ`.

The browser never talks to Supabase. The server uses the publishable key for sign-in and session refresh, and the secret key for `letters`, `user_secrets`, and `resumes`. The migrations grant those tables only to `service_role` and leave row level security on with no policies, so a publishable key cannot read or write rows. The secret key bypasses row level security, and every query is limited to the signed-in user.

Each account has one résumé, edited on the settings page. Uploading a PDF, Word, or text file stores the original file and the extracted text. Saving the text keeps that wording for the desk. The original file is downloaded only by that signed-in user. A letter still keeps its own copy of the résumé text from the moment it was written.

## Secrets

Infisical is the only place these values are stored. The app still reads `process.env`, so the secret names stay exactly as listed in `.env.example`:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `XAI_API_KEY` for Grok
- `GEMINI_API_KEY` for Gemini

Either model key can be omitted. The missing model falls back to a labeled structured draft, which is still stored in Supabase. Keep both Supabase keys server-side. Do not prefix the secret key with `NEXT_PUBLIC_`, and do not store a legacy `anon` or `service_role` key.

A signed-in user can save their own Grok and Gemini keys on the settings page. Those values live in `user_secrets`, locked the same way as `letters`. The browser receives only a mask of the last four characters. When a personal key is saved, writing uses that key and does not fall back to the Infisical value. Clearing it returns that provider to the system key. Grok and Gemini are contacted only after the signed-in session authenticates successfully.

A JobsDB link is read from the public job page. Only `https://hk.jobsdb.com/job/<id>` and `https://th.jobsdb.com/job/<id>` are accepted. The server fetches that page and copies the title, company, and description into a new letter. No Apify token is used.

If `SUPABASE_URL` or `SUPABASE_PUBLISHABLE_KEY` is empty, the server also reads `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. A value wrapped in one pair of quotes is accepted. The setup screen names the variable that is missing or rejected, and it never prints the value. A publishable key must start with `sb_publishable_`. A secret key must start with `sb_secret_`. The URL must be `https`, except `http://localhost` and `http://127.0.0.1`.

Use a `dev` environment for local work and a `prod` environment for Railway. Keep the key schema as `{{secretKey}}` so the names are not prefixed.

## Railway

`railway.toml` builds with Nixpacks (`npm run build`) and starts with `npm run start`. Both commands load Infisical before Next starts, then the server listens on `0.0.0.0` and Railway's `PORT`. Railway injects `PORT`; do not store it in Infisical, and a fetched `PORT` is ignored.

Set only these three variables on the Railway service. Do not sync the Supabase or model secrets into Railway.

- `INFISICAL_ID`: the Infisical project id
- `INFISICAL_TOKEN`: a Bearer access token for that project
- `INFISICAL_ENV`: the environment slug, such as `prod`

`npm run build` and `npm run start` call `https://us.infisical.com/api/v4/secrets` with that token. For the EU cloud or a self-hosted instance, also set `INFISICAL_API_URL` to its origin. The token is not printed. If any of the three values is missing while another is set, the process exits. If none are set, the command runs with the environment it already has, which is how local tests and CI build.

## Run locally

Install the [Infisical CLI](https://infisical.com/docs/cli/overview), then from this directory:

```bash
npm install
infisical login
infisical init
npm run dev:infisical
```

`infisical init` writes `.infisical.json` with the project id only. Commit that file. `npm run dev:infisical` runs `infisical secrets-manager run --env=dev -- npm run dev` and injects the `dev` secrets. The dev server listens on port 4747. `npm test` runs the unit and integration suites. `npm run lint` runs ESLint.

## Testing

No Supabase project or model key is required.

```bash
npm run test:unit
npm run test:integration
npm test
npx playwright install chromium
npm run test:e2e
```

`npm test` runs unit and integration tests with `node:test` and does not launch a browser. Unit tests cover the structured drafter, draft parsing, Supabase key checks, write limits, HTTP helpers, text extraction, model response parsing, and letter mapping. Integration tests call the route handlers with an in-memory letters store. They do not contact Supabase, xAI, or Gemini.

`npm run test:e2e` runs the setup spec, then the desk spec. Each spec starts its own dev server so the two processes do not compile Google fonts at the same time. The server uses webpack. Turbopack currently fails while rewriting the Noto Serif TC stylesheet. Port 4748 has Supabase unset and expects the setup screen. Port 4749 sets `COVER_DESK_E2E=1`, signs in a fixed desk user, stores letters in memory, and writes a structured draft. That flag is ignored when `NODE_ENV` is `production`. Do not set it on Railway. Install Chromium once with `npx playwright install chromium`.

On Node 20.16, Tailwind's `magic-string` dependency is ESM-only and cannot be loaded with `require()`. The e2e servers set `NODE_OPTIONS` to preload `e2e/preload.cjs`, a small CommonJS stand-in used only by those processes.

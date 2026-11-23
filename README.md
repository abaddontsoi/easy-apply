# 函箋

A writing desk for cover letters and application emails. A résumé and a target job description become a letter, an email, or both. The prose uses only facts from the résumé. Requirements the résumé does not support are listed beside the draft.

The interface is Traditional Chinese. The letter can be English or Traditional Chinese. Grok (`grok-4.7` on the xAI API) or Gemini (`gemini-3.5-flash-lite`) writes the prose. With neither key set, the app still saves a structured draft built from the résumé and labels it as such.

Accounts, résumés, job descriptions, and letters live in Supabase. Nothing is kept in the browser.

## Supabase

1. Create a project.
2. Run `supabase/migrations/0001_letters.sql` in the SQL editor.
3. Enable email sign-in. Set the Site URL to the Railway URL.
4. Copy the project URL and the anon key. The anon key is safe to use with the row-level security policies in that migration. Do not put the service-role key in this app.

## Secrets

Infisical is the only place these values are stored. The app still reads `process.env`, so the secret names stay exactly as listed in `.env.example`:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `XAI_API_KEY` for Grok
- `GEMINI_API_KEY` for Gemini

Either model key can be omitted. The missing model falls back to a labeled structured draft, which is still stored in Supabase. Do not put the Supabase service-role key in Infisical for this app.

Use a `dev` environment for local work and a `prod` environment for Railway. Keep the key schema as `{{secretKey}}` so the names are not prefixed.

## Railway

`railway.toml` builds with Nixpacks (`npm run build`) and starts with `npm run start`. The server listens on `0.0.0.0` and Railway's `PORT`. Railway injects `PORT`; do not store it in Infisical.

Create a Railway connection in Infisical, then a Railway secret sync from the `prod` environment to this service. Turn on auto-sync. The start command does not call the Infisical CLI.

## Run locally

Install the [Infisical CLI](https://infisical.com/docs/cli/overview), then from this directory:

```bash
npm install
infisical login
infisical init
npm run dev:infisical
```

`infisical init` writes `.infisical.json` with the project id only. Commit that file. `npm run dev:infisical` runs `infisical secrets-manager run --env=dev -- npm run dev` and injects the `dev` secrets. The dev server listens on port 4747. `npm test` checks the structured drafter. `npm run lint` runs ESLint.

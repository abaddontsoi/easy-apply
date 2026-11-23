# 函箋

A writing desk for cover letters and application emails. A résumé and a target job description become a letter, an email, or both. The prose uses only facts from the résumé. Requirements the résumé does not support are listed beside the draft.

The interface is Traditional Chinese. The letter can be English or Traditional Chinese. Grok (`grok-4.7` on the xAI API) or Gemini (`gemini-3.5-flash-lite`) writes the prose. With neither key set, the app still saves a structured draft built from the résumé and labels it as such.

Accounts, résumés, job descriptions, and letters live in Supabase. Nothing is kept in the browser.

## Supabase

1. Create a project.
2. Run `supabase/migrations/0001_letters.sql` in the SQL editor.
3. Enable email sign-in. Set the Site URL to the Railway URL.
4. Copy the project URL and the anon key. The anon key is safe to use with the row-level security policies in that migration. Do not put the service-role key in this app.

## Railway

`railway.toml` builds with Nixpacks (`npm run build`) and starts with `npm run start`. The server listens on `0.0.0.0` and Railway's `PORT`.

Set these variables on the service:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `XAI_API_KEY` for Grok
- `GEMINI_API_KEY` for Gemini

Either model key can be omitted. The missing model falls back to a labeled structured draft, which is still stored in Supabase.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Fill `.env.local` with the same variables. The dev server listens on port 4747. `npm test` checks the structured drafter. `npm run lint` runs ESLint.

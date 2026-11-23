# 函箋

A private writing desk that turns a résumé and a target job description into a cover letter, an application email, or both.

The page is in Traditional Chinese. The letter itself can be English or Traditional Chinese. Prose uses only facts that appear in the résumé. Requirements the résumé does not support are listed beside the draft instead of being written in as experience.

## Write a letter

1. Paste a résumé, or upload a PDF, `.docx`, or text file.
2. Paste the job description. Company, role, and the recipient’s name are optional.
3. Choose tone, length, language, and whether you want a letter, an email, or both.
4. Edit the result, then copy or download it.

**載入範例** fills a fictional résumé so you can try the flow. That person is not real.

The résumé can be remembered in this browser. Uncheck that option, or press 清除, to remove it. The server does not store the résumé.

## Model

When `OPENAI_API_KEY` is set, drafting calls OpenAI (`gpt-4o-mini`). The key stays on the server.

Without that key, the app still writes a structured draft from sentences in the résumé and labels it as such. It does not translate or invent achievements.

On the published app, add the key as a Cursor secret named `OPENAI_API_KEY`. Locally, export it in the environment before starting the server.

## Run locally

```bash
npm install
npm run dev
```

The dev server listens on port 4747. `npm test` checks the structured drafter. `npm run lint` runs ESLint.

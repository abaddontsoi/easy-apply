# 求職信與應徵電郵：模型呼叫實作指南

這份指南把「一段 system prompt、一段 user 訊息、JSON 輸出、空欄重試一次、失敗改用結構草稿」落到函箋現有的撰寫流程。實作時改 `src/lib/models.ts` 及其測試，不要另開一套生成器，也不要從 ChatAd 複製廣告文案的 prompt。

介面文案維持香港書面中文。程式、型別、路由路徑維持英文。

## 已落地，不要重寫

| 行為 | 位置 |
|---|---|
| PDF、`.docx`、`.txt`、`.md` 抽成純文字，上限 20,000 字、4MB | `src/lib/extract.ts` |
| 履歷與職缺各至少 40 字、至多 20,000 字；公司、職位、招聘者各 120 字 | `parseDraftInput` in `src/lib/draft.ts` |
| Grok 與 Gemini 共用同一份 system prompt 與 user 訊息 | `SYSTEM`、`userPrompt` in `src/lib/models.ts` |
| 沒有金鑰、金鑰被拒、逾時、或回傳無法使用時，改存結構草稿 | `POST` in `src/app/api/draft/route.ts`、`composeStructured` in `src/lib/compose.ts` |
| 登入後才呼叫模型；個人金鑰優先，否則用 Infisical 的系統金鑰 | `authenticateCaller`、`resolveModelKey` |
| 同一帳號十分鐘最多八次撰寫 | `allowWrite` in `src/lib/guard.ts` |
| 寫入 `letters`，並帶上當時的履歷文字 | `saveLetter` |

履歷檔不要放進模型請求。`extractDocument` 已經把 PDF 和 Word 變成文字。Gemini 請求的 `contents` 只放這段文字。

## 目標呼叫

兩家模型都走 `writeWithModel`。登入失敗丟 `UnauthenticatedError`，此時不得發網路請求。金鑰是空字串時丟 `ModelError("unauthorized")`，同樣不得發請求。

每次 HTTP 呼叫逾時 45 秒（`AbortSignal.timeout(45_000)`）。逾時、401、403、其他非 2xx 都不重試。只有「有 2xx 但 JSON 不能用」才重試，而且只重試一次。

### Gemini

`GEMINI_MODEL` 維持 `gemini-3.5-flash-lite`。端點維持：

`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent`

標頭：`content-type: application/json`，`x-goog-api-key` 放金鑰。金鑰不得出現在 URL、日誌或回應。

```json
{
  "systemInstruction": { "parts": [{ "text": "<SYSTEM 或 REVISE_SYSTEM>" }] },
  "contents": [{ "role": "user", "parts": [{ "text": "<userPrompt>" }] }],
  "generationConfig": {
    "temperature": 0.4,
    "maxOutputTokens": 4000,
    "responseMimeType": "application/json"
  }
}
```

`temperature` 與 `maxOutputTokens` 保持這兩個數字。讀取正文時跳過 `thought: true` 的 part，只拼接其餘 part 的 `text`。現有 `readGeminiContent` 已這樣做。

### Grok

`GROK_MODEL` 維持 `grok-4.7`。端點維持 `https://api.x.ai/v1/chat/completions`。標頭：`Authorization: Bearer <key>`。

```json
{
  "model": "grok-4.7",
  "temperature": 0.4,
  "max_tokens": 4000,
  "messages": [
    { "role": "system", "content": "<SYSTEM 或 REVISE_SYSTEM>" },
    { "role": "user", "content": "<userPrompt>" }
  ]
}
```

不要加模型候選清單，也不要在 404 時改叫另一個模型 id。測試鎖定這兩個 id。

## System prompt

第一次撰寫繼續用現有 `SYSTEM`。欄位形狀寫在這段文字裡。Gemini 的 `responseMimeType` 只負責要求 JSON；不要另送一份 schema 字串。

```text
You write job application letters and emails for the person whose résumé is in the user message.
Use only facts that appear in the résumé. Never invent employers, titles, dates, metrics, tools, degrees, languages, or outcomes.
If a job requirement is not supported by the résumé, put a short phrase for it in omissions and do not claim it in the prose.
Do not flatter. Do not use the words passionate, dynamic, synergy, leverage, or "I am writing to express".
Write in the requested language. Plain text only, no markdown.
Return a JSON object with keys subject, letter, email, usedFacts, omissions.
usedFacts is an array of short phrases copied from the résumé.
omissions is an array of requirements you could not support.
When format is letter, email is an empty string. When format is email, letter is an empty string.
When format is both, the email is shorter than the letter.
Sign with the name on the résumé when one is present.
If company, role, or hiring manager is blank, use those words only when the job description states them. Otherwise stay generic ("the role", "貴公司這個職位").
```

修訂時改用 `REVISE_SYSTEM`。它保留上面的事實限制，並改成只動使用者點名的部分：

```text
You revise a job application letter or email for the person whose résumé is in the user message.
Apply the writer's instruction. Keep every other sentence as close to the current draft as you can.
Use only facts that appear in the résumé. Never invent employers, titles, dates, metrics, tools, degrees, languages, or outcomes.
If a job requirement is not supported by the résumé, put a short phrase for it in omissions and do not claim it in the prose.
Do not flatter. Do not use the words passionate, dynamic, synergy, leverage, or "I am writing to express".
Write in the requested language. Plain text only, no markdown.
Return a JSON object with keys subject, letter, email, usedFacts, omissions.
usedFacts is an array of short phrases copied from the résumé.
omissions is an array of requirements you could not support.
When format is letter, email is an empty string. When format is email, letter is an empty string.
When format is both, the email is shorter than the letter.
Sign with the name on the résumé when one is present.
```

## User 訊息

`userPrompt` 維持這個順序。履歷和職缺用三引號包住，避免和指示混在一起。

```text
Language: Traditional Chinese (zh-Hant) | English
Tone: professional | warm | confident | direct
Length: <LENGTH_GUIDE[length]>
Format: letter | email | both
Company (blank if unknown): ...
Role (blank if unknown): ...
Hiring manager (blank if unknown): ...

Résumé:
"""
...
"""

Job description:
"""
...
"""
```

篇幅對照維持 `LENGTH_GUIDE`：

| `length` | 指示 |
|---|---|
| `email` | about 120 words, or about 220 Chinese characters |
| `letter` | about 280 words, or about 500 Chinese characters |
| `detailed` | about 430 words, or about 750 Chinese characters |

`language: zh-Hant` 寫成 `Traditional Chinese (zh-Hant)`，`en` 寫成 `English`。

修訂時，在職缺區塊後面加上現稿和指示。指示先 `trim`，再截到 300 字。現稿用請求裡的 `subject`、`letter`、`email`（各截到與 `parseSavedLetter` 相同的上限：主旨 180、正文 8,000）。

```text
Current subject:
"""
...
"""

Current letter:
"""
...
"""

Current email:
"""
...
"""

Writer instruction (apply this, keep the rest):
"""
...
"""
```

空欄重試時不要改 system prompt。只在 user 訊息末尾加一句：

```text
The previous reply was unusable. Return one JSON object. subject, and the prose required by Format, must be non-empty.
```

## 解析

沿用 `parseModelJson`：

1. 去掉首尾空白和一層 ` ```json ` 圍欄。
2. `JSON.parse`。結果必須是物件，不能是陣列。
3. 失敗時從第一個 `{` 切到最後一個 `}` 再解析一次。
4. 仍然失敗則視為壞回覆。

`normalizeModel` 的規則維持不變：

- `format` 不是 `email` 時，`letter` 必須有字。
- `format` 不是 `letter` 時，`email` 必須有字。
- 不需要的那一側清空，即使模型填了內容。
- `subject` 空則改用 `composeStructured(input).subject`，這不算失敗。
- `letter`、`email`、`subject` 去掉 NUL，截到 8,000；主旨再截到 180。
- `usedFacts`、`omissions` 只留字串，每條 240 字，最多 8 條。
- 成功時 `mode` 是 `"model"`，`notice` 是空字串。

## 空欄重試

把 Grok 與 Gemini 的單次請求收成一個內部函式，例如 `completeOnce(input, key, extraHint?)`。`writeWithModel` 的流程：

1. 第一次呼叫，不帶 extra hint。
2. 若丟出的是 `ModelError("bad_response")`，用同一把金鑰、同一份 system prompt 再呼叫一次，並帶上上面那句重試提示。
3. 第二次仍是 `bad_response`，把這個錯誤拋出。
4. `unauthorized`、`unavailable`、`UnauthenticatedError` 立刻拋出，不發第二次。

路由層維持現狀。`writeWithModel` 拋錯時，`src/app/api/draft/route.ts` 用 `composeStructured` 覆寫草稿，並寫上 `fallbackNotice`。結構草稿的 `mode` 是 `"structured"`。這次不要記成模型成功。

401 與 403 對應 `unauthorized`。其餘非 2xx、網路錯誤、逾時對應 `unavailable`。JSON 不是物件、或必填正文是空的，對應 `bad_response`。

## 修訂請求

`POST /api/draft` 增加一個可選欄位，不改資料表。

| 欄位 | 規則 |
|---|---|
| `instruction` | 可省略。有值時必須是字串，`trim` 後 1 到 300 字。超過回 400，文案：「修改指示請保持在 300 字以內。」 |
| `subject`、`letter`、`email` | 僅在 `instruction` 非空時讀取，上限與 `parseSavedLetter` 相同 |

`instruction` 為空：走現有 `SYSTEM`，忽略正文欄位（與今天的 `parseDraftInput` 一樣）。

`instruction` 非空：

- 用 `REVISE_SYSTEM` 和帶現稿的 user 訊息。
- 仍然先過 `allowWrite`。修訂算一次撰寫。
- 模型失敗時，不要改叫 `composeStructured` 蓋掉使用者已經有的信。回應 200，正文沿用請求裡的 `subject`、`letter`、`email`，`mode` 維持請求裡的 `mode`（只接受 `model` 或 `structured`，其他當 `structured`），`notice` 用 `fallbackNotice` 的同一套句子。仍呼叫 `saveLetter`。
- 模型成功時，與第一次撰寫一樣儲存，`notice` 為空。

書桌（`src/components/desk.tsx`）在已有草稿時加一個指示框和「按指示改寫」按鈕。按鈕把 `payload()` 裡已有的 `subject`、`letter`、`email` 加上 `instruction` 送到同一個 `/api/draft`。沒有草稿時不顯示這個按鈕。

## 建議的函式切分

全部留在 `src/lib/models.ts`，避免第二套 prompt。

```ts
export async function writeWithModel(
  input: DraftInput,
  keys?: ModelKeys,
  revision?: { instruction: string; subject: string; letter: string; email: string },
): Promise<DraftOutput>
```

`revision` 缺省就是第一次撰寫。`instruction` 已由路由截好。`writeWithGrok` 與 `writeWithGemini` 接收同一組 `system` 與 `userText`，差別只在 HTTP 形狀和讀回覆的方式。

路由在呼叫前組好 `revision`。`writeWithModel` 不讀 `Request`。

## 測試

單元測試在 `src/lib/models.test.ts`，沿用現有的 `stubFetch`。

- Gemini 成功時，請求含 `systemInstruction`、`temperature: 0.4`、`maxOutputTokens: 4000`、`responseMimeType: "application/json"`，而且沒有 `inlineData`。
- 第一個 Gemini 回覆是 `"not json"`，第二個回覆是合法電郵 JSON：呼叫兩次，結果 `mode === "model"`。
- 兩次都是壞 JSON：拋 `ModelError`，`code === "bad_response"`，`fetch` 恰好兩次。
- 第一次 401：拋 `unauthorized`，`fetch` 恰好一次。
- 第一次逾時（`fetch` reject 或 `AbortSignal`）：拋 `unavailable`，`fetch` 恰好一次。
- `revision.instruction` 有值時，system 文字含 `You revise`，user 文字含現有正文和指示。
- `format: "letter"` 時，模型回傳的 `email` 仍被清空。

整合測試在 `tests/integration/draft.test.ts`。

- 沒有 `instruction` 時，行為與現有「無金鑰則結構草稿」「401 則結構草稿」兩則相同。
- 帶 `instruction` 且模型 503：回應 200，`letter` 等於請求裡的原文，不是結構草稿的「履歷裡對得上的幾點」，`notice` 說明模型沒有完成，而且該列已寫入記憶體 store。
- `instruction` 超過 300 字：400，且沒有新列。

`npm run test:unit` 與 `npm run test:integration` 都要過。不要為這次改動去跑會打到 xAI 或 Gemini 的手動請求。

## 不要做

- 不要把履歷位元組放進 `inlineData` 或 `image_url`。
- 不要改 `letters` 的欄位或 check constraint。`instruction` 只存在這一次請求。
- 不要在日誌印出金鑰、履歷全文或職缺全文。
- 不要新增第三個 provider，也不要改預設模型 id。
- 不要把結構草稿的句子送回模型當「成功的 model 輸出」。`mode: "structured"` 必須留在回傳和資料列上。

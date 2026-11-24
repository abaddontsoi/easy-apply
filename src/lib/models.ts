import { composeStructured } from "@/lib/compose";
import { EMPTY_KEYS, resolveModelKey, type KeySource, type ModelKeys } from "@/lib/credentials";
import type { DraftInput, DraftOutput, Length, Provider } from "@/lib/draft";
import { authenticateCaller } from "@/lib/session";

const GROK_MODEL = "grok-4.7";
const GEMINI_MODEL = "gemini-3.5-flash-lite";
const GROK_ENDPOINT = "https://api.x.ai/v1/chat/completions";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const LENGTH_GUIDE: Record<Length, string> = {
  email: "about 120 words, or about 220 Chinese characters",
  letter: "about 280 words, or about 500 Chinese characters",
  detailed: "about 430 words, or about 750 Chinese characters",
};

export type ProviderStatus = {
  grok: boolean;
  gemini: boolean;
};

export function providerStatus(keys: ModelKeys = EMPTY_KEYS): ProviderStatus {
  return {
    grok: Boolean(resolveModelKey("grok", keys).value),
    gemini: Boolean(resolveModelKey("gemini", keys).value),
  };
}

export function providerReady(provider: Provider, keys: ModelKeys = EMPTY_KEYS): boolean {
  return Boolean(resolveModelKey(provider, keys).value);
}

export class ModelError extends Error {
  readonly code: "unauthorized" | "unavailable" | "bad_response";

  constructor(code: "unauthorized" | "unavailable" | "bad_response") {
    super(code);
    this.name = "ModelError";
    this.code = code;
  }
}

export type ModelRevision = {
  instruction: string;
  subject: string;
  letter: string;
  email: string;
};

const RETRY_HINT =
  "The previous reply was unusable. Return one JSON object. subject, and the prose required by Format, must be non-empty.";

export async function writeWithModel(
  input: DraftInput,
  keys: ModelKeys = EMPTY_KEYS,
  revision?: ModelRevision,
): Promise<DraftOutput> {
  await authenticateCaller();
  const resolved = resolveModelKey(input.provider, keys);
  if (!resolved.value) throw new ModelError("unauthorized");
  const system = revision ? REVISE_SYSTEM : SYSTEM;
  const userText = userPrompt(input, revision);
  try {
    return await completeOnce(input, resolved.value, system, userText);
  } catch (error) {
    if (!(error instanceof ModelError) || error.code !== "bad_response") throw error;
  }
  return completeOnce(input, resolved.value, system, `${userText}\n\n${RETRY_HINT}`);
}

export function fallbackNotice(
  provider: Provider,
  code: ModelError["code"] | "missing",
  source: KeySource = "system",
): string {
  if (code === "missing") {
    const name = provider === "grok" ? "Grok" : "Gemini";
    return `尚未連接 ${name}，所以這是結構草稿。句子來自履歷原文，不會補上沒有的成就。`;
  }
  if (code === "unauthorized") {
    if (source === "user") {
      const name = provider === "grok" ? "Grok" : "Gemini";
      return `${name} 沒有接受你在設定頁儲存的金鑰，所以改用結構草稿。`;
    }
    return provider === "grok"
      ? "Grok 沒有接受這把金鑰，所以改用結構草稿。請在 Infisical 檢查 XAI_API_KEY。"
      : "Gemini 沒有接受這把金鑰，所以改用結構草稿。請在 Infisical 檢查 GEMINI_API_KEY。";
  }
  const name = provider === "grok" ? "Grok" : "Gemini";
  return `${name} 這次沒有完成，所以改用結構草稿。句子仍來自履歷原文。`;
}

async function completeOnce(
  input: DraftInput,
  key: string,
  system: string,
  userText: string,
): Promise<DraftOutput> {
  const payload =
    input.provider === "grok"
      ? await postJson(
          GROK_ENDPOINT,
          {
            authorization: `Bearer ${key}`,
            "content-type": "application/json",
          },
          {
            model: GROK_MODEL,
            temperature: 0.4,
            max_tokens: 4000,
            messages: [
              { role: "system", content: system },
              { role: "user", content: userText },
            ],
          },
        )
      : await postJson(
          GEMINI_ENDPOINT,
          {
            "content-type": "application/json",
            "x-goog-api-key": key,
          },
          {
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: "user", parts: [{ text: userText }] }],
            generationConfig: {
              temperature: 0.4,
              maxOutputTokens: 4000,
              responseMimeType: "application/json",
            },
          },
        );
  const text = input.provider === "grok" ? readChatContent(payload) : readGeminiContent(payload);
  const parsed = parseModelJson(text);
  if (!parsed) throw new ModelError("bad_response");
  return normalizeModel(input, parsed);
}

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(45_000),
      headers,
      body: JSON.stringify(body),
    });
  } catch {
    throw new ModelError("unavailable");
  }
  if (response.status === 401 || response.status === 403) throw new ModelError("unauthorized");
  if (!response.ok) throw new ModelError("unavailable");
  try {
    return await response.json();
  } catch {
    throw new ModelError("bad_response");
  }
}

const SYSTEM = `You write job application letters and emails for the person whose résumé is in the user message.
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
If company, role, or hiring manager is blank, use those words only when the job description states them. Otherwise stay generic ("the role", "貴公司這個職位").`;

const REVISE_SYSTEM = `You revise a job application letter or email for the person whose résumé is in the user message.
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
Sign with the name on the résumé when one is present.`;

function userPrompt(input: DraftInput, revision?: ModelRevision): string {
  const language = input.language === "zh-Hant" ? "Traditional Chinese (zh-Hant)" : "English";
  const lines = [
    `Language: ${language}`,
    `Tone: ${input.tone}`,
    `Length: ${LENGTH_GUIDE[input.length]}`,
    `Format: ${input.format}`,
    `Company (blank if unknown): ${input.company}`,
    `Role (blank if unknown): ${input.role}`,
    `Hiring manager (blank if unknown): ${input.hiringManager}`,
    "",
    "Résumé:",
    '"""',
    input.resume,
    '"""',
    "",
    "Job description:",
    '"""',
    input.jobDescription,
    '"""',
  ];
  if (revision) {
    lines.push(
      "",
      "Current subject:",
      '"""',
      revision.subject.slice(0, 180),
      '"""',
      "",
      "Current letter:",
      '"""',
      revision.letter.slice(0, 8_000),
      '"""',
      "",
      "Current email:",
      '"""',
      revision.email.slice(0, 8_000),
      '"""',
      "",
      "Writer instruction (apply this, keep the rest):",
      '"""',
      revision.instruction.trim().slice(0, 300),
      '"""',
    );
  }
  return lines.join("\n");
}

function readChatContent(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") return "";
  const message = (choices[0] as { message?: unknown }).message;
  if (!message || typeof message !== "object") return "";
  const content = (message as { content?: unknown }).content;
  return typeof content === "string" ? content : "";
}

function readGeminiContent(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const candidates = (payload as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || !candidates[0] || typeof candidates[0] !== "object") return "";
  const content = (candidates[0] as { content?: unknown }).content;
  if (!content || typeof content !== "object") return "";
  const parts = (content as { parts?: unknown }).parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      if ((part as { thought?: unknown }).thought === true) return "";
      const text = (part as { text?: unknown }).text;
      return typeof text === "string" ? text : "";
    })
    .join("");
}

function parseModelJson(content: string): Record<string, unknown> | null {
  const stripped = content.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  if (!stripped) return null;
  try {
    const value = JSON.parse(stripped) as unknown;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch {
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const value = JSON.parse(stripped.slice(start, end + 1)) as unknown;
        if (value && typeof value === "object" && !Array.isArray(value)) {
          return value as Record<string, unknown>;
        }
      } catch {
        return null;
      }
    }
  }
  return null;
}

function normalizeModel(input: DraftInput, raw: Record<string, unknown>): DraftOutput {
  const letter = clipProse(raw.letter);
  const email = clipProse(raw.email);
  const needsLetter = input.format !== "email";
  const needsEmail = input.format !== "letter";
  if ((needsLetter && !letter) || (needsEmail && !email)) {
    throw new ModelError("bad_response");
  }
  return {
    mode: "model",
    subject: clipProse(raw.subject).slice(0, 180) || composeStructured(input).subject,
    letter: needsLetter ? letter : "",
    email: needsEmail ? email : "",
    usedFacts: clipList(raw.usedFacts),
    omissions: clipList(raw.omissions),
    notice: "",
  };
}

function clipProse(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\u0000/g, "").trim().slice(0, 8_000);
}

function clipList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.replace(/\s+/g, " ").trim().slice(0, 240))
    .filter(Boolean)
    .slice(0, 8);
}

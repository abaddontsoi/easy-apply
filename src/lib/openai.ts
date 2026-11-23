import { composeStructured } from "@/lib/compose";
import type { DraftInput, DraftOutput, Length } from "@/lib/draft";

const MODEL = "gpt-4o-mini";
const ENDPOINT = "https://api.openai.com/v1/chat/completions";

const LENGTH_GUIDE: Record<Length, string> = {
  email: "about 120 words, or about 220 Chinese characters",
  letter: "about 280 words, or about 500 Chinese characters",
  detailed: "about 430 words, or about 750 Chinese characters",
};

export function modelConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export class ModelError extends Error {
  readonly code: "unauthorized" | "unavailable" | "bad_response";

  constructor(code: "unauthorized" | "unavailable" | "bad_response") {
    super(code);
    this.name = "ModelError";
    this.code = code;
  }
}

export async function writeWithModel(input: DraftInput): Promise<DraftOutput> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new ModelError("unauthorized");

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      signal: AbortSignal.timeout(45_000),
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.4,
        max_tokens: input.format === "both" || input.length === "detailed" ? 1600 : 1100,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userPrompt(input) },
        ],
      }),
    });
  } catch {
    throw new ModelError("unavailable");
  }

  if (response.status === 401 || response.status === 403) {
    throw new ModelError("unauthorized");
  }
  if (!response.ok) {
    throw new ModelError("unavailable");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ModelError("bad_response");
  }

  const content = readContent(payload);
  if (!content) throw new ModelError("bad_response");
  const parsed = parseModelJson(content);
  if (!parsed) throw new ModelError("bad_response");
  return normalizeModel(input, parsed);
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

function userPrompt(input: DraftInput): string {
  const language = input.language === "zh-Hant" ? "Traditional Chinese (zh-Hant)" : "English";
  return [
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
  ].join("\n");
}

function readContent(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") return "";
  const message = (choices[0] as { message?: unknown }).message;
  if (!message || typeof message !== "object") return "";
  const content = (message as { content?: unknown }).content;
  return typeof content === "string" ? content : "";
}

function parseModelJson(content: string): Record<string, unknown> | null {
  const stripped = content.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
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

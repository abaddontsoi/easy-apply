export const TONES = ["professional", "warm", "confident", "direct"] as const;
export const LENGTHS = ["email", "letter", "detailed"] as const;
export const LANGUAGES = ["en", "zh-Hant"] as const;
export const FORMATS = ["letter", "email", "both"] as const;

export type Tone = (typeof TONES)[number];
export type Length = (typeof LENGTHS)[number];
export type Language = (typeof LANGUAGES)[number];
export type Format = (typeof FORMATS)[number];

export const LIMITS = {
  resume: 20_000,
  job: 20_000,
  field: 120,
  minText: 40,
} as const;

export type DraftInput = {
  resume: string;
  jobDescription: string;
  company: string;
  role: string;
  hiringManager: string;
  tone: Tone;
  length: Length;
  language: Language;
  format: Format;
};

export type DraftMode = "model" | "structured";

export type DraftOutput = {
  mode: DraftMode;
  subject: string;
  letter: string;
  email: string;
  usedFacts: string[];
  omissions: string[];
  notice: string;
};

export type Viewer = {
  name: string;
  email: string;
  kind: "person" | "key";
  simulated: boolean;
};

const TONE_SET = new Set<string>(TONES);
const LENGTH_SET = new Set<string>(LENGTHS);
const LANGUAGE_SET = new Set<string>(LANGUAGES);
const FORMAT_SET = new Set<string>(FORMATS);

export function parseDraftInput(
  body: unknown,
): { ok: true; value: DraftInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "請送出履歷和職缺說明。" };
  }
  const record = body as Record<string, unknown>;
  const resume = asText(record.resume);
  const jobDescription = asText(record.jobDescription);
  if (resume.length < LIMITS.minText || jobDescription.length < LIMITS.minText) {
    return {
      ok: false,
      error: "履歷和職缺說明都再多寫一點，才有辦法對上經歷和職位要求。",
    };
  }
  if (resume.length > LIMITS.resume || jobDescription.length > LIMITS.job) {
    return { ok: false, error: "履歷或職缺說明超過 20,000 字，請先剪短再撰寫。" };
  }
  const tone = record.tone;
  const length = record.length;
  const language = record.language;
  const format = record.format;
  if (typeof tone !== "string" || !TONE_SET.has(tone)) {
    return { ok: false, error: "請選擇語氣。" };
  }
  if (typeof length !== "string" || !LENGTH_SET.has(length)) {
    return { ok: false, error: "請選擇篇幅。" };
  }
  if (typeof language !== "string" || !LANGUAGE_SET.has(language)) {
    return { ok: false, error: "請選擇語言。" };
  }
  if (typeof format !== "string" || !FORMAT_SET.has(format)) {
    return { ok: false, error: "請選擇要產出求職信、電郵，或兩者。" };
  }
  return {
    ok: true,
    value: {
      resume,
      jobDescription,
      company: clipField(record.company),
      role: clipField(record.role),
      hiringManager: clipField(record.hiringManager),
      tone: tone as Tone,
      length: length as Length,
      language: language as Language,
      format: format as Format,
    },
  };
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\u0000/g, "").trim() : "";
}

function clipField(value: unknown): string {
  return asText(value).replace(/\s+/g, " ").slice(0, LIMITS.field);
}

import type { DraftInput, DraftMode, DraftOutput, Provider } from "@/lib/draft";
import { privateJson } from "@/lib/http";
import type { Session } from "@/lib/session";

const MAX_LETTERS = 100;

export type LetterSummary = {
  id: string;
  role: string;
  company: string;
  subject: string;
  provider: Provider;
  mode: DraftMode;
  updatedAt: string;
};

export type StoredLetter = LetterSummary & DraftInput & DraftOutput;

type Row = {
  id: string;
  resume: string;
  job_description: string;
  company: string;
  role: string;
  hiring_manager: string;
  tone: string;
  length: string;
  language: string;
  format: string;
  provider: string;
  subject: string;
  letter: string;
  email: string;
  used_facts: unknown;
  omissions: unknown;
  mode: string;
  notice: string;
  updated_at: string;
};

export async function listLetters(session: Session): Promise<LetterSummary[] | Response> {
  const { data, error } = await session.supabase
    .from("letters")
    .select("id, role, company, subject, provider, mode, updated_at")
    .order("updated_at", { ascending: false })
    .limit(MAX_LETTERS);
  if (error) return storeFailure(error);
  return (data as Row[]).flatMap((row) => {
    const summary = toSummary(row);
    return summary ? [summary] : [];
  });
}

export async function readLetter(session: Session, id: string): Promise<StoredLetter | Response> {
  const { data, error } = await session.supabase
    .from("letters")
    .select(
      "id, resume, job_description, company, role, hiring_manager, tone, length, language, format, provider, subject, letter, email, used_facts, omissions, mode, notice, updated_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) return storeFailure(error);
  if (!data) return privateJson({ error: "找不到這封信。" }, 404);
  const letter = toStored(data as Row);
  if (!letter) return privateJson({ error: "這封信的資料不完整。" }, 500);
  return letter;
}

export async function saveLetter(
  session: Session,
  id: string | null,
  input: DraftInput,
  output: DraftOutput,
): Promise<{ id: string } | Response> {
  const record = {
    user_id: session.userId,
    resume: input.resume,
    job_description: input.jobDescription,
    company: input.company,
    role: input.role,
    hiring_manager: input.hiringManager,
    tone: input.tone,
    length: input.length,
    language: input.language,
    format: input.format,
    provider: input.provider,
    subject: output.subject,
    letter: output.letter,
    email: output.email,
    used_facts: output.usedFacts,
    omissions: output.omissions,
    mode: output.mode,
    notice: output.notice,
    updated_at: new Date().toISOString(),
  };

  if (!id) {
    const { count, error: countError } = await session.supabase
      .from("letters")
      .select("id", { count: "exact", head: true });
    if (countError) return storeFailure(countError);
    if ((count ?? 0) >= MAX_LETTERS) {
      return privateJson({ error: "已有 100 封信。刪掉舊的，才能再存。" }, 409);
    }
    const { data, error } = await session.supabase.from("letters").insert(record).select("id").single();
    if (error) return storeFailure(error);
    return { id: String((data as { id: string }).id) };
  }

  const { data, error } = await session.supabase
    .from("letters")
    .update({
      resume: record.resume,
      job_description: record.job_description,
      company: record.company,
      role: record.role,
      hiring_manager: record.hiring_manager,
      tone: record.tone,
      length: record.length,
      language: record.language,
      format: record.format,
      provider: record.provider,
      subject: record.subject,
      letter: record.letter,
      email: record.email,
      used_facts: record.used_facts,
      omissions: record.omissions,
      mode: record.mode,
      notice: record.notice,
      updated_at: record.updated_at,
    })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return storeFailure(error);
  if (!data) return privateJson({ error: "找不到這封信。" }, 404);
  return { id: String((data as { id: string }).id) };
}

export async function removeLetter(session: Session, id: string): Promise<Response | null> {
  const { error, count } = await session.supabase
    .from("letters")
    .delete({ count: "exact" })
    .eq("id", id);
  if (error) return storeFailure(error);
  if (!count) return privateJson({ error: "找不到這封信。" }, 404);
  return null;
}

function storeFailure(error: { code?: string }): Response {
  if (error.code === "PGRST205" || error.code === "42P01") {
    return privateJson(
      { error: "Supabase 還沒有 letters 資料表。請執行 supabase/migrations/0001_letters.sql。" },
      500,
    );
  }
  return privateJson({ error: "Supabase 這次沒有存成。" }, 500);
}

function toSummary(row: Row): LetterSummary | null {
  if (!isProvider(row.provider) || !isMode(row.mode) || !row.id || !row.updated_at) return null;
  return {
    id: row.id,
    role: row.role ?? "",
    company: row.company ?? "",
    subject: row.subject ?? "",
    provider: row.provider,
    mode: row.mode,
    updatedAt: row.updated_at,
  };
}

function toStored(row: Row): StoredLetter | null {
  const summary = toSummary(row);
  if (!summary) return null;
  if (!isTone(row.tone) || !isLength(row.length) || !isLanguage(row.language) || !isFormat(row.format)) {
    return null;
  }
  return {
    ...summary,
    resume: row.resume ?? "",
    jobDescription: row.job_description ?? "",
    company: row.company ?? "",
    role: row.role ?? "",
    hiringManager: row.hiring_manager ?? "",
    tone: row.tone,
    length: row.length,
    language: row.language,
    format: row.format,
    provider: row.provider as Provider,
    subject: row.subject ?? "",
    letter: row.letter ?? "",
    email: row.email ?? "",
    usedFacts: stringList(row.used_facts),
    omissions: stringList(row.omissions),
    mode: row.mode as DraftMode,
    notice: row.notice ?? "",
  };
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").slice(0, 8);
}

function isProvider(value: string): value is Provider {
  return value === "grok" || value === "gemini";
}
function isMode(value: string): value is DraftMode {
  return value === "model" || value === "structured";
}
function isTone(value: string): value is DraftInput["tone"] {
  return value === "professional" || value === "warm" || value === "confident" || value === "direct";
}
function isLength(value: string): value is DraftInput["length"] {
  return value === "email" || value === "letter" || value === "detailed";
}
function isLanguage(value: string): value is DraftInput["language"] {
  return value === "en" || value === "zh-Hant";
}
function isFormat(value: string): value is DraftInput["format"] {
  return value === "letter" || value === "email" || value === "both";
}

import { privateJson } from "@/lib/http";
import type { Session } from "@/lib/session";

const MAX_KEYWORDS = 200;
const MAX_LENGTH = 80;

export type KeywordRecord = {
  text: string;
  hits: number;
};

type Row = {
  text?: unknown;
  normalized?: unknown;
  hits?: unknown;
};

export function keywordFromSelection(value: string): string | null {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length < 1 || text.length > MAX_LENGTH) return null;
  return text;
}

export function normalizeKeyword(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase("en");
}

export function splitMarks(text: string, keywords: string[]): { value: string; marked: boolean }[] {
  const needles = uniqueNeedles(keywords);
  if (needles.length === 0 || text.length === 0) return [{ value: text, marked: false }];
  const lower = text.toLocaleLowerCase("en");
  const ranges = rangesFor(lower, needles);
  if (ranges.length === 0) return [{ value: text, marked: false }];
  const parts: { value: string; marked: boolean }[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) parts.push({ value: text.slice(cursor, range.start), marked: false });
    parts.push({ value: text.slice(range.start, range.end), marked: true });
    cursor = range.end;
  }
  if (cursor < text.length) parts.push({ value: text.slice(cursor), marked: false });
  return parts;
}

export function matchingKeywords(corpus: string, keywords: KeywordRecord[]): KeywordRecord[] {
  const lower = corpus.toLocaleLowerCase("en");
  return keywords.filter((keyword) => appears(lower, normalizeKeyword(keyword.text)));
}

export async function listKeywords(session: Session): Promise<KeywordRecord[] | Response> {
  const { data, error } = await session.data
    .from("keywords")
    .select("text, hits")
    .eq("user_id", session.userId)
    .limit(MAX_KEYWORDS);
  if (error) return missingOrFailed(error.code);
  const keywords = (Array.isArray(data) ? data : [])
    .map(toRecord)
    .filter((keyword): keyword is KeywordRecord => keyword !== null);
  keywords.sort((left, right) => right.hits - left.hits || left.text.localeCompare(right.text, "zh-Hant"));
  return keywords;
}

export async function addKeyword(session: Session, raw: string): Promise<KeywordRecord | Response> {
  const text = keywordFromSelection(raw);
  if (!text) return privateJson({ error: "請選取 1 到 80 個字的關鍵字。" }, 400);
  const normalized = normalizeKeyword(text);
  const existing = await findKeyword(session, normalized);
  if (existing instanceof Response) return existing;
  if (existing) return existing;

  const listed = await listKeywords(session);
  if (listed instanceof Response) return listed;
  if (listed.length >= MAX_KEYWORDS) {
    return privateJson({ error: "關鍵字已有 200 個。請先在統計頁移除一些。" }, 400);
  }

  const inserted = await session.data
    .from("keywords")
    .insert({ user_id: session.userId, text, normalized, hits: 0 })
    .select("text, hits")
    .maybeSingle();
  if (inserted.error) {
    if (inserted.error.code === "23505") {
      const raced = await findKeyword(session, normalized);
      if (raced instanceof Response) return raced;
      if (raced) return raced;
    }
    return missingOrFailed(inserted.error.code);
  }
  return toRecord(inserted.data) ?? { text, hits: 0 };
}

export async function removeKeyword(session: Session, raw: string): Promise<true | Response> {
  const normalized = normalizeKeyword(raw);
  if (!normalized) return privateJson({ error: "請選取 1 到 80 個字的關鍵字。" }, 400);
  const { error } = await session.data
    .from("keywords")
    .delete()
    .eq("user_id", session.userId)
    .eq("normalized", normalized);
  if (error) return missingOrFailed(error.code);
  return true;
}

export async function recordKeywordHits(session: Session, parts: string[]): Promise<void> {
  try {
    const listed = await listKeywords(session);
    if (listed instanceof Response || listed.length === 0) return;
    const matched = matchingKeywords(parts.join("\n"), listed);
    await Promise.all(
      matched.map((keyword) =>
        session.data
          .from("keywords")
          .update({ hits: keyword.hits + 1 })
          .eq("user_id", session.userId)
          .eq("normalized", normalizeKeyword(keyword.text)),
      ),
    );
  } catch {
    // A missing keyword table must not block the letter that was just written.
  }
}

function uniqueNeedles(keywords: string[]): string[] {
  const seen = new Set<string>();
  const needles: string[] = [];
  for (const keyword of keywords) {
    const needle = normalizeKeyword(keyword);
    if (!needle || seen.has(needle)) continue;
    seen.add(needle);
    needles.push(needle);
  }
  needles.sort((left, right) => right.length - left.length);
  return needles;
}

function rangesFor(lower: string, needles: string[]): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  for (const needle of needles) {
    let from = 0;
    while (from <= lower.length - needle.length) {
      const start = lower.indexOf(needle, from);
      if (start < 0) break;
      const end = start + needle.length;
      if (bounded(lower, start, needle) && ranges.every((range) => end <= range.start || start >= range.end)) {
        ranges.push({ start, end });
      }
      from = start + 1;
    }
  }
  ranges.sort((left, right) => left.start - right.start);
  return ranges;
}

function appears(lower: string, needle: string): boolean {
  if (!needle) return false;
  let from = 0;
  while (from <= lower.length - needle.length) {
    const start = lower.indexOf(needle, from);
    if (start < 0) return false;
    if (bounded(lower, start, needle)) return true;
    from = start + 1;
  }
  return false;
}

function bounded(source: string, start: number, needle: string): boolean {
  const first = needle[0] ?? "";
  const last = needle[needle.length - 1] ?? "";
  if (isLatinWordChar(first) && isLatinWordChar(source[start - 1] ?? "")) return false;
  if (isLatinWordChar(last) && isLatinWordChar(source[start + needle.length] ?? "")) return false;
  return true;
}

function isLatinWordChar(char: string): boolean {
  return /[a-z0-9]/i.test(char);
}

async function findKeyword(session: Session, normalized: string): Promise<KeywordRecord | null | Response> {
  const { data, error } = await session.data
    .from("keywords")
    .select("text, hits")
    .eq("user_id", session.userId)
    .eq("normalized", normalized)
    .maybeSingle();
  if (error) return missingOrFailed(error.code);
  return toRecord(data);
}

function toRecord(value: unknown): KeywordRecord | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Row;
  const text = typeof row.text === "string" ? row.text : "";
  if (!text) return null;
  const hits = typeof row.hits === "number" && Number.isFinite(row.hits) ? Math.max(0, Math.floor(row.hits)) : 0;
  return { text, hits };
}

function missingOrFailed(code: string | undefined): Response {
  if (code === "42P01" || code === "PGRST205") {
    return privateJson(
      { error: "Supabase 還沒有 keywords 資料表。請依序執行 supabase/migrations 裡的 SQL。" },
      500,
    );
  }
  return privateJson({ error: "這次沒有存成關鍵字。" }, 500);
}

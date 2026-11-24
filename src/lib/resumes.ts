import { privateJson } from "@/lib/http";
import type { Session } from "@/lib/session";

const MAX_CHARS = 20_000;

export type ResumeView = {
  filename: string;
  mediaType: string;
  text: string;
  truncated: boolean;
  hasFile: boolean;
  updatedAt: string;
};

export type ResumeFile = {
  filename: string;
  mediaType: string;
  bytes: Uint8Array;
};

type StoredResume = {
  filename: string;
  mediaType: string;
  fileBase64: string;
  text: string;
  truncated: boolean;
  updatedAt: string;
};

type Row = {
  filename?: unknown;
  media_type?: unknown;
  file_base64?: unknown;
  text?: unknown;
  truncated?: unknown;
  updated_at?: unknown;
};

type Loaded = { ok: true; row: StoredResume | null } | { ok: false; missing: boolean };

export function resumeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 180);
  return cleaned || "resume";
}

export function resumeMediaType(filename: string): string {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  if (extension === "pdf") return "application/pdf";
  if (extension === "docx") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (extension === "md") return "text/markdown; charset=utf-8";
  return "text/plain; charset=utf-8";
}

export async function readResume(session: Session): Promise<ResumeView | null | Response> {
  const loaded = await loadRow(session);
  if (!loaded.ok) {
    if (loaded.missing) return null;
    return privateJson({ error: "讀不到履歷。" }, 503);
  }
  return loaded.row ? toView(loaded.row) : null;
}

export async function readResumeFile(session: Session): Promise<ResumeFile | null | Response> {
  const loaded = await loadRow(session);
  if (!loaded.ok) {
    if (loaded.missing) return null;
    return privateJson({ error: "讀不到履歷檔。" }, 503);
  }
  if (!loaded.row?.fileBase64) return null;
  return {
    filename: loaded.row.filename || "resume",
    mediaType: loaded.row.mediaType || "application/octet-stream",
    bytes: new Uint8Array(Buffer.from(loaded.row.fileBase64, "base64")),
  };
}

export async function saveResumeText(
  session: Session,
  text: string,
  clearFile = false,
): Promise<ResumeView | Response> {
  const loaded = await loadRow(session);
  if (!loaded.ok) return missingOrFailed(loaded.missing);
  const cleaned = cleanText(text);
  const current = loaded.row;
  const sameText = current?.text === cleaned.text;
  return writeRow(session, {
    filename: clearFile ? "" : (current?.filename ?? ""),
    media_type: clearFile ? "" : (current?.mediaType ?? ""),
    file_base64: clearFile ? "" : (current?.fileBase64 ?? ""),
    text: cleaned.text,
    truncated: clearFile ? false : sameText ? Boolean(current?.truncated) : cleaned.truncated,
  });
}

export async function saveResumeFile(
  session: Session,
  file: { filename: string; mediaType: string; bytes: Uint8Array; text: string; truncated: boolean },
): Promise<ResumeView | Response> {
  const loaded = await loadRow(session);
  if (!loaded.ok) return missingOrFailed(loaded.missing);
  const cleaned = cleanText(file.text);
  return writeRow(session, {
    filename: resumeFilename(file.filename),
    media_type: file.mediaType,
    file_base64: Buffer.from(file.bytes).toString("base64"),
    text: cleaned.text,
    truncated: file.truncated || cleaned.truncated,
  });
}

export async function removeResume(session: Session): Promise<Response | null> {
  const { error } = await session.data.from("resumes").delete().eq("user_id", session.userId);
  if (!error) return null;
  return missingOrFailed(error.code === "42P01" || error.code === "PGRST205");
}

async function loadRow(session: Session): Promise<Loaded> {
  const { data, error } = await session.data
    .from("resumes")
    .select("filename, media_type, file_base64, text, truncated, updated_at")
    .eq("user_id", session.userId)
    .maybeSingle();
  if (error) return { ok: false, missing: error.code === "42P01" || error.code === "PGRST205" };
  if (!data) return { ok: true, row: null };
  return { ok: true, row: toStored(data as Row) };
}

async function writeRow(
  session: Session,
  record: {
    filename: string;
    media_type: string;
    file_base64: string;
    text: string;
    truncated: boolean;
  },
): Promise<ResumeView | Response> {
  const next = { ...record, updated_at: new Date().toISOString() };
  const updated = await session.data
    .from("resumes")
    .update(next)
    .eq("user_id", session.userId)
    .select("user_id")
    .maybeSingle();
  if (updated.error) return missingOrFailed(updated.error.code === "42P01" || updated.error.code === "PGRST205");
  if (updated.data) return toView(toStored({ ...next }));
  const inserted = await session.data
    .from("resumes")
    .insert({ user_id: session.userId, ...next })
    .select("user_id")
    .maybeSingle();
  if (inserted.error) return missingOrFailed(inserted.error.code === "42P01" || inserted.error.code === "PGRST205");
  return toView(toStored(next));
}

function toStored(row: Row): StoredResume {
  return {
    filename: text(row.filename),
    mediaType: text(row.media_type),
    fileBase64: text(row.file_base64),
    text: text(row.text),
    truncated: row.truncated === true,
    updatedAt: text(row.updated_at),
  };
}

function toView(row: StoredResume): ResumeView {
  return {
    filename: row.filename,
    mediaType: row.mediaType,
    text: row.text,
    truncated: row.truncated,
    hasFile: row.fileBase64.length > 0,
    updatedAt: row.updatedAt,
  };
}

function cleanText(value: string): { text: string; truncated: boolean } {
  const normalized = value.replace(/\u0000/g, "").replace(/\r\n/g, "\n");
  if (normalized.length <= MAX_CHARS) return { text: normalized, truncated: false };
  return { text: normalized.slice(0, MAX_CHARS), truncated: true };
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function missingOrFailed(missing: boolean): Response {
  if (missing) {
    return privateJson(
      { error: "Supabase 還沒有 resumes 資料表。請依序執行 supabase/migrations 裡的 SQL。" },
      500,
    );
  }
  return privateJson({ error: "這次沒有存成履歷。" }, 500);
}

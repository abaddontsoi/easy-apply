import { EMPTY_KEYS, type KeyPatch, type StoredKeys } from "@/lib/credentials";
import { privateJson } from "@/lib/http";
import type { Session } from "@/lib/session";

type Row = {
  grok_key?: unknown;
  gemini_key?: unknown;
};

export type KeyLoad =
  | { ok: true; keys: StoredKeys }
  | { ok: false; missing: boolean };

export async function keysForRequest(session: Session): Promise<StoredKeys | Response> {
  const loaded = await loadUserKeys(session);
  if (!loaded.ok && !loaded.missing) {
    return privateJson({ error: "讀不到你的金鑰，這次沒有改用系統金鑰。" }, 503);
  }
  return loaded.ok ? loaded.keys : { ...EMPTY_KEYS };
}

export async function loadUserKeys(session: Session): Promise<KeyLoad> {
  const { data, error } = await session.data
    .from("user_secrets")
    .select("grok_key, gemini_key")
    .eq("user_id", session.userId)
    .maybeSingle();
  if (error) {
    return { ok: false, missing: error.code === "42P01" || error.code === "PGRST205" };
  }
  if (!data) return { ok: true, keys: { ...EMPTY_KEYS } };
  return { ok: true, keys: toKeys(data as Row) };
}

export async function saveUserKeys(session: Session, patch: KeyPatch): Promise<StoredKeys | Response> {
  const loaded = await loadUserKeys(session);
  if (!loaded.ok) {
    if (loaded.missing) {
      return privateJson(
        { error: "Supabase 還沒有 user_secrets 資料表。請依序執行 supabase/migrations 裡的 SQL。" },
        500,
      );
    }
    return privateJson({ error: "這次沒有存成金鑰。" }, 500);
  }

  const next: StoredKeys = {
    grok: patch.grok ?? loaded.keys.grok,
    gemini: patch.gemini ?? loaded.keys.gemini,
  };
  const record = {
    grok_key: next.grok,
    gemini_key: next.gemini,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await session.data
    .from("user_secrets")
    .update(record)
    .eq("user_id", session.userId)
    .select("user_id")
    .maybeSingle();
  if (error) return writeFailure(error);
  if (data) return next;
  if (!next.grok && !next.gemini) return next;

  const inserted = await session.data
    .from("user_secrets")
    .insert({ user_id: session.userId, ...record })
    .select("user_id")
    .maybeSingle();
  if (inserted.error) return writeFailure(inserted.error);
  return next;
}

function toKeys(row: Row): StoredKeys {
  return {
    grok: text(row.grok_key),
    gemini: text(row.gemini_key),
  };
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function writeFailure(error: { code?: string }): Response {
  if (error.code === "42P01" || error.code === "PGRST205") {
    return privateJson(
      { error: "Supabase 還沒有 user_secrets 資料表。請依序執行 supabase/migrations 裡的 SQL。" },
      500,
    );
  }
  return privateJson({ error: "這次沒有存成金鑰。" }, 500);
}

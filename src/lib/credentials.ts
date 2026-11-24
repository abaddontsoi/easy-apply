export type KeySource = "user" | "system" | "none";

export type ResolvedSecret = {
  value: string;
  source: KeySource;
};

export type ModelKeys = {
  grok: string;
  gemini: string;
};

export type StoredKeys = ModelKeys & {
  apify: string;
};

export type KeyFieldStatus = {
  source: KeySource;
  mask: string;
};

export type SettingsView = {
  grok: KeyFieldStatus;
  gemini: KeyFieldStatus;
  apify: KeyFieldStatus;
};

export type KeyPatch = Partial<StoredKeys>;

const SECRET_PATTERN = /^[\x21-\x7E]{8,200}$/;

export const EMPTY_KEYS: StoredKeys = { grok: "", gemini: "", apify: "" };

export function maskSecret(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return `••••${trimmed.slice(-4)}`;
}

export function parseKeyPatch(value: unknown): { ok: true; patch: KeyPatch } | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "請送出完整的內容。" };
  }
  const record = value as Record<string, unknown>;
  const patch: KeyPatch = {};
  for (const field of ["grok", "gemini", "apify"] as const) {
    if (!Object.prototype.hasOwnProperty.call(record, field)) continue;
    const raw = record[field];
    if (raw === null) {
      patch[field] = "";
      continue;
    }
    if (typeof raw !== "string") return { ok: false, error: "金鑰格式不對。" };
    const trimmed = raw.trim();
    if (!trimmed) {
      patch[field] = "";
      continue;
    }
    if (!SECRET_PATTERN.test(trimmed)) {
      return { ok: false, error: "金鑰只能是 8 到 200 個不含空白的字元。" };
    }
    patch[field] = trimmed;
  }
  if (Object.keys(patch).length === 0) return { ok: false, error: "沒有要儲存的金鑰。" };
  return { ok: true, patch };
}

export function resolveOwnedSecret(userValue: string, systemValue: string | undefined): ResolvedSecret {
  const own = userValue.trim();
  if (own) {
    const cleaned = cleanSecret(own);
    return { value: cleaned, source: "user" };
  }
  const system = cleanSecret(systemValue ?? "");
  return system ? { value: system, source: "system" } : { value: "", source: "none" };
}

export function resolveModelKey(provider: "grok" | "gemini", keys: ModelKeys = EMPTY_KEYS): ResolvedSecret {
  const userValue = provider === "grok" ? keys.grok : keys.gemini;
  const systemValue = provider === "grok" ? process.env.XAI_API_KEY : process.env.GEMINI_API_KEY;
  return resolveOwnedSecret(userValue, systemValue);
}

export function resolveApifyToken(userToken = ""): ResolvedSecret {
  return resolveOwnedSecret(userToken, process.env.APIFY_TOKEN);
}

export function describeKeys(keys: StoredKeys): SettingsView {
  return {
    grok: describeField(keys.grok, process.env.XAI_API_KEY),
    gemini: describeField(keys.gemini, process.env.GEMINI_API_KEY),
    apify: describeField(keys.apify, process.env.APIFY_TOKEN),
  };
}

function describeField(userValue: string, systemValue: string | undefined): KeyFieldStatus {
  const resolved = resolveOwnedSecret(userValue, systemValue);
  if (resolved.source === "user") return { source: "user", mask: maskSecret(userValue) };
  return { source: resolved.source, mask: "" };
}

function cleanSecret(value: string): string {
  let token = value.trim();
  if (
    (token.startsWith("\"") && token.endsWith("\"")) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    token = token.slice(1, -1).trim();
  }
  if (!token || /\s/.test(token)) return "";
  return token;
}

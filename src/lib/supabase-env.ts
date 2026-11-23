const PUBLISHABLE_PREFIX = "sb_publishable_";
const SECRET_PREFIX = "sb_secret_";

export function readSupabaseUrl(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol === "https:") return trimmed;
    if (url.protocol === "http:" && local) return trimmed;
  } catch {
    return null;
  }
  return null;
}

export function readPublishableKey(value: string | undefined): string | null {
  return readPrefixedKey(value, PUBLISHABLE_PREFIX);
}

export function readSecretKey(value: string | undefined): string | null {
  return readPrefixedKey(value, SECRET_PREFIX);
}

function readPrefixedKey(value: string | undefined, prefix: string): string | null {
  const key = value?.trim() ?? "";
  if (!key.startsWith(prefix) || key.length === prefix.length) return null;
  if (/\s/.test(key)) return null;
  return key;
}

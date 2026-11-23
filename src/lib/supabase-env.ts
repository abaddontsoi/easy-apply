const PUBLISHABLE_PREFIX = "sb_publishable_";
const SECRET_PREFIX = "sb_secret_";

export type SetupIssue = {
  name: "SUPABASE_URL" | "SUPABASE_PUBLISHABLE_KEY" | "SUPABASE_SECRET_KEY";
  reason: "missing" | "invalid";
};

export function readSupabaseUrl(value: string | undefined): string | null {
  const trimmed = unwrap(value);
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

export function supabaseSetupIssues(input: {
  url?: string;
  publishable?: string;
  secret?: string;
}): SetupIssue[] {
  return [
    classify("SUPABASE_URL", input.url, readSupabaseUrl),
    classify("SUPABASE_PUBLISHABLE_KEY", input.publishable, readPublishableKey),
    classify("SUPABASE_SECRET_KEY", input.secret, readSecretKey),
  ].filter((issue): issue is SetupIssue => issue !== null);
}

function classify(
  name: SetupIssue["name"],
  value: string | undefined,
  read: (value: string | undefined) => string | null,
): SetupIssue | null {
  if (!unwrap(value)) return { name, reason: "missing" };
  if (!read(value)) return { name, reason: "invalid" };
  return null;
}

function readPrefixedKey(value: string | undefined, prefix: string): string | null {
  const key = unwrap(value);
  if (!key.startsWith(prefix) || key.length === prefix.length) return null;
  if (/\s/.test(key)) return null;
  return key;
}

function unwrap(value: string | undefined): string {
  let trimmed = value?.trim() ?? "";
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    trimmed = trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

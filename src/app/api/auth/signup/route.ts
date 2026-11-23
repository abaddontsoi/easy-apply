import { privateJson, readJson } from "@/lib/http";
import { createClient, supabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!supabaseConfigured()) {
    return privateJson({ error: "Supabase 尚未設定。" }, 503);
  }
  const body = await readJson(request, 4_000);
  if (!body.ok) return body.response;
  const credentials = readCredentials(body.value);
  if (!credentials) return privateJson({ error: "請輸入電郵和至少 8 個字元的密碼。" }, 400);

  const supabase = await createClient();
  if (!supabase) return privateJson({ error: "Supabase 尚未設定。" }, 503);
  const { data, error } = await supabase.auth.signUp(credentials);
  if (error) return privateJson({ error: "這個電郵沒有完成註冊。請換一個，或直接登入。" }, 400);
  if (!data.session) {
    return privateJson({ email: credentials.email, needsConfirmation: true });
  }
  return privateJson({ email: data.user?.email ?? credentials.email, needsConfirmation: false });
}

function readCredentials(value: unknown): { email: string; password: string } | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { email?: unknown; password?: unknown };
  if (typeof record.email !== "string" || typeof record.password !== "string") return null;
  const email = record.email.trim().toLowerCase();
  const password = record.password;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return null;
  if (password.length < 8 || password.length > 72) return null;
  return { email, password };
}

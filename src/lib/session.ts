import { privateJson } from "@/lib/http";
import { createClient, supabaseConfigured } from "@/lib/supabase";

export type Session = {
  supabase: NonNullable<Awaited<ReturnType<typeof createClient>>>;
  userId: string;
  email: string;
};

export async function currentUser(): Promise<{ email: string } | null> {
  if (!supabaseConfigured()) return null;
  const supabase = await createClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.email) return null;
  return { email: data.user.email };
}

export async function requireUser(): Promise<Session | Response> {
  if (!supabaseConfigured()) {
    return privateJson({ error: "Supabase 尚未設定。履歷和文稿只會存在 Supabase。" }, 503);
  }
  const supabase = await createClient();
  if (!supabase) {
    return privateJson({ error: "Supabase 尚未設定。履歷和文稿只會存在 Supabase。" }, 503);
  }
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return privateJson({ error: "請先登入。" }, 401);
  return { supabase, userId: data.user.id, email: data.user.email ?? "" };
}

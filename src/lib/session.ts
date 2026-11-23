import { privateJson } from "@/lib/http";
import { createAuthClient, createDataClient, supabaseConfigured } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

export type Session = {
  data: SupabaseClient;
  userId: string;
  email: string;
};

export async function currentUser(): Promise<{ email: string } | null> {
  if (!supabaseConfigured()) return null;
  const supabase = await createAuthClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.email) return null;
  return { email: data.user.email };
}

export async function requireUser(): Promise<Session | Response> {
  if (!supabaseConfigured()) {
    return privateJson({ error: "Supabase 尚未設定。履歷和文稿只會存在 Supabase。" }, 503);
  }
  const auth = await createAuthClient();
  const data = createDataClient();
  if (!auth || !data) {
    return privateJson({ error: "Supabase 尚未設定。履歷和文稿只會存在 Supabase。" }, 503);
  }
  const { data: userData, error } = await auth.auth.getUser();
  const user = userData.user;
  if (error || !user?.email) return privateJson({ error: "請先登入。" }, 401);
  return { data, userId: user.id, email: user.email };
}

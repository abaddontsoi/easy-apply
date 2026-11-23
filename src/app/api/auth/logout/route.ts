import { privateJson } from "@/lib/http";
import { createClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await createClient();
  if (supabase) await supabase.auth.signOut();
  return privateJson({ ok: true });
}

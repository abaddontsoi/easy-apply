import { privateJson } from "@/lib/http";
import { createAuthClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await createAuthClient();
  // Local scope drops this browser's cookies before the revoke request, so a network fault still signs out.
  if (supabase) await supabase.auth.signOut({ scope: "local" });
  return privateJson({ ok: true });
}

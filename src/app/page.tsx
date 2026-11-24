import { AuthScreen } from "@/components/auth-screen";
import { Desk } from "@/components/desk";
import { SetupScreen } from "@/components/setup-screen";
import { EMPTY_KEYS } from "@/lib/credentials";
import { providerStatus } from "@/lib/models";
import { requireUser } from "@/lib/session";
import { supabaseConfigurationIssues, supabaseConfigured } from "@/lib/supabase";
import { loadUserKeys } from "@/lib/user-keys";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!supabaseConfigured()) {
    return <SetupScreen providers={providerStatus()} issues={supabaseConfigurationIssues()} />;
  }
  const session = await requireUser();
  if (session instanceof Response) return <AuthScreen />;
  const loaded = await loadUserKeys(session);
  const providers = providerStatus(loaded.ok ? loaded.keys : EMPTY_KEYS);
  const keyWarning = loaded.ok || loaded.missing ? "" : "讀不到你的金鑰，這次不會改用系統金鑰。";
  return <Desk email={session.email} providers={providers} keyWarning={keyWarning} />;
}

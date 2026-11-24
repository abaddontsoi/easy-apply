import { AuthScreen } from "@/components/auth-screen";
import { SettingsForm } from "@/components/settings-form";
import { SetupScreen } from "@/components/setup-screen";
import { describeKeys, EMPTY_KEYS, type SettingsView } from "@/lib/credentials";
import { providerStatus } from "@/lib/models";
import { requireUser } from "@/lib/session";
import { supabaseConfigurationIssues, supabaseConfigured } from "@/lib/supabase";
import { loadUserKeys } from "@/lib/user-keys";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  if (!supabaseConfigured()) {
    return <SetupScreen providers={providerStatus()} issues={supabaseConfigurationIssues()} />;
  }
  const session = await requireUser();
  if (session instanceof Response) return <AuthScreen />;
  const loaded = await loadUserKeys(session);
  const view: SettingsView = describeKeys(loaded.ok ? loaded.keys : EMPTY_KEYS);
  const warning = loaded.ok || loaded.missing ? "" : "讀不到你的金鑰，這次不會改用系統金鑰。";
  return <SettingsForm email={session.email} initial={view} warning={warning} />;
}

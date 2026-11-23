import { AuthScreen } from "@/components/auth-screen";
import { Desk } from "@/components/desk";
import { SetupScreen } from "@/components/setup-screen";
import { providerStatus } from "@/lib/models";
import { currentUser } from "@/lib/session";
import { supabaseConfigurationIssues, supabaseConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function Home() {
  const providers = providerStatus();
  if (!supabaseConfigured()) {
    return <SetupScreen providers={providers} issues={supabaseConfigurationIssues()} />;
  }
  const user = await currentUser();
  if (!user) return <AuthScreen />;
  return <Desk email={user.email} providers={providers} />;
}

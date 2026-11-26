import { AppShell } from "@/components/app-shell";
import { AuthScreen } from "@/components/auth-screen";
import { KeywordStats } from "@/components/keyword-stats";
import { SetupScreen } from "@/components/setup-screen";
import { providerStatus } from "@/lib/models";
import { requireUser } from "@/lib/session";
import { supabaseConfigurationIssues, supabaseConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function StatsPage() {
  if (!supabaseConfigured()) {
    return <SetupScreen providers={providerStatus()} issues={supabaseConfigurationIssues()} />;
  }
  const session = await requireUser();
  if (session instanceof Response) return <AuthScreen />;
  return (
    <AppShell email={session.email}>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid w-full max-w-3xl gap-4 px-4 py-6 sm:px-5">
          <h1 className="font-serif text-3xl leading-none tracking-tight">統計</h1>
          <KeywordStats />
        </div>
      </main>
    </AppShell>
  );
}

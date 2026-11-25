import { AppShell } from "@/components/app-shell";
import { AuthScreen } from "@/components/auth-screen";
import { JobSearch } from "@/components/job-search";
import { SetupScreen } from "@/components/setup-screen";
import { providerStatus } from "@/lib/models";
import { requireUser } from "@/lib/session";
import { supabaseConfigurationIssues, supabaseConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  if (!supabaseConfigured()) {
    return <SetupScreen providers={providerStatus()} issues={supabaseConfigurationIssues()} />;
  }
  const session = await requireUser();
  if (session instanceof Response) return <AuthScreen />;
  return (
    <AppShell email={session.email}>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid w-full max-w-3xl gap-4 px-4 py-6 sm:px-5">
          <div>
            <h1 className="font-serif text-3xl leading-none tracking-tight">職缺連結</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              貼上 JobsDB 職缺頁。讀到之後會打開寫作新信件，並帶入公司、職位和職缺說明。
            </p>
          </div>
          <JobSearch />
        </div>
      </main>
    </AppShell>
  );
}

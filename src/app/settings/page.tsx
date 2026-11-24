import { AppShell } from "@/components/app-shell";
import { AuthScreen } from "@/components/auth-screen";
import { ResumeForm, type ResumeInitial } from "@/components/resume-form";
import { SettingsForm } from "@/components/settings-form";
import { SetupScreen } from "@/components/setup-screen";
import { describeKeys, EMPTY_KEYS, type SettingsView } from "@/lib/credentials";
import { providerStatus } from "@/lib/models";
import { readResume } from "@/lib/resumes";
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
  const stored = await readResume(session);
  const resumeWarning = stored instanceof Response ? "讀不到履歷。" : "";
  const resume: ResumeInitial | null =
    stored instanceof Response || !stored
      ? null
      : { text: stored.text, filename: stored.filename, hasFile: stored.hasFile, truncated: stored.truncated };
  return (
    <AppShell email={session.email}>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-6 sm:px-5">
          <h1 className="font-serif text-3xl leading-none tracking-tight">設定</h1>
          <ResumeForm initial={resume} warning={resumeWarning} />
          <SettingsForm initial={view} warning={warning} />
        </div>
      </main>
    </AppShell>
  );
}

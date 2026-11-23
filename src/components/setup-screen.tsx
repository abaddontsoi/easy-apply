import type { ProviderStatus } from "@/lib/models";

export function SetupScreen({ providers }: { providers: ProviderStatus }) {
  return (
    <main className="mx-auto grid min-h-screen max-w-2xl content-center gap-6 px-4 py-10">
      <header className="flex items-start gap-3">
        <div
          aria-hidden
          className="grid size-11 shrink-0 place-items-center rounded-md bg-primary font-serif text-xl text-primary-foreground"
        >
          函
        </div>
        <div>
          <h1 className="font-serif text-3xl leading-none">函箋</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            履歷、職缺和寫好的信都存在 Supabase。寫作可以選 Grok 或 Gemini。
          </p>
        </div>
      </header>
      <section className="grid gap-3 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
        <h2 className="font-serif text-xl">先接上 Supabase</h2>
        <ol className="grid list-decimal gap-2 pl-5 text-sm leading-6">
          <li>在 Supabase 建立專案，於 SQL Editor 依序執行 supabase/migrations/0001_letters.sql 與 0002_lock_letters.sql。</li>
          <li>在 Authentication 開啟 Email。Site URL 填 Railway 給這個服務的網址。</li>
          <li>在 API Keys 建立 publishable key 與這個服務專用的 secret key，並停用 legacy anon、service_role。在 Infisical 建立 SUPABASE_URL、SUPABASE_PUBLISHABLE_KEY、SUPABASE_SECRET_KEY，以及要使用的 XAI_API_KEY、GEMINI_API_KEY，再同步到 Railway。名稱不要加前綴，也不要填 eyJ 開頭的舊金鑰。</li>
          <li>用這個專案的 railway.toml 部署。服務會聽 PORT，並綁在 0.0.0.0。</li>
        </ol>
        <p className="text-sm text-muted-foreground">
          Grok {providers.grok ? "已連接" : "尚未連接"}。Gemini {providers.gemini ? "已連接" : "尚未連接"}。
          沒有金鑰時仍可登入，文稿會標成結構草稿，並一樣寫進 Supabase。
        </p>
      </section>
    </main>
  );
}

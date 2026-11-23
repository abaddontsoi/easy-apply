"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function AuthScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    setPending(true);
    try {
      const response = await fetch(mode === "login" ? "/api/auth/login" : "/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        needsConfirmation?: boolean;
      } | null;
      if (!response.ok) {
        setError(payload?.error ?? "沒有完成。");
        return;
      }
      if (payload?.needsConfirmation) {
        setNotice("帳號已建立。請到信箱按確認連結，再回來登入。");
        setMode("login");
        return;
      }
      router.refresh();
    } catch {
      setError("連不上登入服務。");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto grid min-h-screen max-w-md content-center gap-6 px-4 py-10">
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
            登入後，履歷和求職信只存在你的 Supabase 帳號裡。
          </p>
        </div>
      </header>
      <form className="grid gap-4 rounded-xl bg-card p-5 ring-1 ring-foreground/10" onSubmit={onSubmit}>
        <h2 className="font-serif text-xl">{mode === "login" ? "登入" : "建立帳號"}</h2>
        <div className="grid gap-1.5">
          <Label htmlFor="email">電郵</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="password">密碼</Label>
          <Input
            id="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>
        {error ? (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {notice ? <p className="rounded-lg bg-accent px-3 py-2 text-sm">{notice}</p> : null}
        <Button type="submit" className="h-10" disabled={pending}>
          {pending ? "處理中" : mode === "login" ? "登入" : "建立帳號"}
        </Button>
        <button
          type="button"
          className="text-left text-sm text-muted-foreground underline-offset-4 hover:underline"
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setError("");
            setNotice("");
          }}
        >
          {mode === "login" ? "還沒有帳號？建立一個" : "已有帳號？登入"}
        </button>
      </form>
    </main>
  );
}

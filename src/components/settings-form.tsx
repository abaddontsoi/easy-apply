"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { KeySource, SettingsView } from "@/lib/credentials";
import { useState, type FormEvent } from "react";

const FIELDS = [
  { id: "grok", label: "Grok", hint: "xAI API 金鑰" },
  { id: "gemini", label: "Gemini", hint: "Google AI API 金鑰" },
  { id: "apify", label: "Apify", hint: "JobsDB 搜尋用的 API 金鑰" },
] as const;

type FieldId = (typeof FIELDS)[number]["id"];

export function SettingsForm({
  initial,
  warning,
}: {
  initial: SettingsView;
  warning: string;
}) {
  const [status, setStatus] = useState(initial);
  const [draft, setDraft] = useState<Record<FieldId, string>>({ grok: "", gemini: "", apify: "" });
  const [error, setError] = useState(warning);
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<FieldId | "save" | "">("");

  async function save(patch: Partial<Record<FieldId, string>>, busy: FieldId | "save") {
    setError("");
    setNotice("");
    setPending(busy);
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok || !isView(body)) {
        setError(readError(body) ?? "這次沒有存成。");
        return;
      }
      setStatus(body);
      setDraft({ grok: "", gemini: "", apify: "" });
      const stored = Object.values(patch).some((value) => value.trim());
      setNotice(stored ? "已儲存。有填的金鑰會取代系統金鑰。" : "已清除。沒有個人金鑰時會使用系統金鑰。");
    } catch {
      setError("連不上設定服務。");
    } finally {
      setPending("");
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const patch: Partial<Record<FieldId, string>> = {};
    for (const field of FIELDS) {
      const value = draft[field.id].trim();
      if (value) patch[field.id] = value;
    }
    if (Object.keys(patch).length === 0) {
      setNotice("");
      setError("請貼上要儲存的金鑰。");
      return;
    }
    void save(patch, "save");
  }

  return (
    <section className="grid gap-4">
      <div>
        <h2 className="font-serif text-2xl">金鑰</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          金鑰只存在 Supabase，這一頁只顯示末四碼。某個欄位有你的金鑰時，撰寫或搜尋就用它，不再用系統金鑰。
        </p>
      </div>
      <form className="grid gap-5 rounded-xl bg-card p-5 ring-1 ring-foreground/10" onSubmit={onSubmit}>
          {FIELDS.map((field) => {
            const fieldStatus = status[field.id];
            return (
              <div key={field.id} className="grid gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <Label htmlFor={field.id}>{field.label}</Label>
                  <span className="text-xs text-muted-foreground">{field.hint}</span>
                </div>
                <Input
                  id={field.id}
                  type="password"
                  name={field.id}
                  autoComplete="new-password"
                  autoCapitalize="off"
                  spellCheck={false}
                  value={draft[field.id]}
                  placeholder={fieldStatus.mask || "貼上金鑰"}
                  onChange={(event) => setDraft((current) => ({ ...current, [field.id]: event.target.value }))}
                />
                <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <p>{sourceLabel(fieldStatus.source, fieldStatus.mask)}</p>
                  {fieldStatus.source === "user" ? (
                    <button
                      type="button"
                      className="underline-offset-4 hover:underline"
                      disabled={pending !== ""}
                      onClick={() => void save({ [field.id]: "" }, field.id)}
                    >
                      {pending === field.id ? "清除中" : "清除，改用系統金鑰"}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
          <Button type="submit" disabled={pending !== ""}>
            {pending === "save" ? "儲存中" : "儲存金鑰"}
          </Button>
      </form>
    </section>
  );
}

function sourceLabel(source: KeySource, mask: string): string {
  if (source === "user") return `使用你的金鑰 ${mask}`;
  if (source === "system") return "未儲存，使用系統金鑰";
  return "未設定";
}

function isView(value: unknown): value is SettingsView {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return ["grok", "gemini", "apify"].every((field) => {
    const status = record[field];
    if (!status || typeof status !== "object") return false;
    const item = status as { source?: unknown; mask?: unknown };
    return (item.source === "user" || item.source === "system" || item.source === "none") && typeof item.mask === "string";
  });
}

function readError(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const error = (value as { error?: unknown }).error;
  return typeof error === "string" && error ? error : null;
}

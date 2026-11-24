"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SAMPLE_RESUME } from "@/lib/sample";
import { cn } from "@/lib/utils";
import { Download, FileUp } from "lucide-react";
import { useRef, useState } from "react";

export type ResumeInitial = {
  text: string;
  filename: string;
  hasFile: boolean;
  truncated: boolean;
};

export function ResumeForm({ initial, warning = "" }: { initial: ResumeInitial | null; warning?: string }) {
  const [text, setText] = useState(initial?.text ?? "");
  const [savedText, setSavedText] = useState(initial?.text ?? "");
  const [filename, setFilename] = useState(initial?.hasFile ? (initial.filename ?? "") : "");
  const [note, setNote] = useState(warning || initialNote(initial));
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dirty = text !== savedText;

  async function persist(next: string, clearFile: boolean, successNote?: string) {
    setSaving(true);
    if (!successNote) setNote("");
    try {
      const response = await fetch("/api/resume", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: next, clearFile }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok || !body || typeof body !== "object") {
        setNote(readError(body) ?? "履歷沒有存進 Supabase。");
        return;
      }
      const stored = (body as { resume?: unknown }).resume;
      if (!isResume(stored)) {
        setNote("履歷沒有存進 Supabase。");
        return;
      }
      setText(stored.text);
      setSavedText(stored.text);
      setFilename(stored.hasFile ? stored.filename : "");
      setNote(
        successNote ??
          (stored.hasFile ? `已儲存 ${stored.filename}。解析文字也在 Supabase。` : "履歷文字已存在 Supabase。"),
      );
    } catch {
      setNote("履歷沒有存進 Supabase。");
    } finally {
      setSaving(false);
    }
  }

  function loadSample() {
    setText(SAMPLE_RESUME);
    setFilename("");
    void persist(
      SAMPLE_RESUME,
      true,
      "已載入虛構範例。Chloe Chan 不是真人。範例文字會存進 Supabase，原來的履歷檔會清掉。",
    );
  }

  async function clearResume() {
    setText("");
    setSavedText("");
    setFilename("");
    setNote("");
    try {
      const response = await fetch("/api/resume", { method: "DELETE" });
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        setNote(readError(body) ?? "履歷沒有清掉。");
      }
    } catch {
      setNote("履歷沒有清掉。");
    }
  }

  async function downloadResume() {
    try {
      const response = await fetch("/api/resume/file");
      if (!response.ok) {
        setNote("讀不到原來的檔案。");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename || "resume";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setNote("讀不到原來的檔案。");
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setNote("");
    setReading(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch("/api/extract", { method: "POST", body });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setNote(readError(payload) ?? "讀不到這個檔案。");
        return;
      }
      if (!payload || typeof payload !== "object" || typeof (payload as { text?: unknown }).text !== "string") {
        setNote("讀不到這個檔案。");
        return;
      }
      const extracted = payload as {
        text: string;
        truncated?: boolean;
        filename?: string;
        hasFile?: boolean;
        saveError?: string;
      };
      setText(extracted.text);
      setSavedText(extracted.text);
      setFilename(extracted.hasFile && extracted.filename ? extracted.filename : "");
      if (extracted.saveError) setNote(extracted.saveError);
      else if (extracted.truncated) setNote("檔案較長，已放入前 20,000 字，原檔已存進 Supabase。");
      else if (extracted.hasFile) setNote(`已儲存 ${extracted.filename || file.name}。解析文字也在 Supabase。`);
      else setNote(`已讀入 ${file.name}`);
    } catch {
      setNote("讀不到這個檔案。請改貼履歷。");
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <section className="grid gap-4 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
      <div>
        <h2 className="font-serif text-2xl">履歷</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          履歷存在 Supabase。撰寫頁使用這裡儲存的文字。上傳會保存原檔和解析文字。
        </p>
      </div>
      <div className="grid gap-1.5">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="resume">履歷文字</Label>
          <span className={cn("text-xs", text.length > 18000 ? "text-destructive" : "text-muted-foreground")}>
            {text.length.toLocaleString("zh-Hant")} / 20,000
          </span>
        </div>
        <Textarea
          id="resume"
          value={text}
          maxLength={20000}
          onChange={(event) => setText(event.target.value)}
          placeholder="貼上履歷，或上傳 PDF、Word、純文字。"
          className="field-sizing-fixed min-h-64 w-full max-w-full resize-y"
        />
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.txt,.md,application/pdf,text/plain"
            className="sr-only"
            onChange={(event) => void onFile(event.target.files?.[0])}
          />
          <Button type="button" variant="outline" disabled={reading || saving} onClick={() => fileRef.current?.click()}>
            <FileUp />
            {reading ? "讀取中" : "上傳履歷"}
          </Button>
          <Button type="button" variant="outline" disabled={saving} onClick={loadSample}>
            載入範例
          </Button>
          <Button type="button" disabled={!dirty || saving} onClick={() => void persist(text, false)}>
            {saving ? "儲存中" : "儲存履歷"}
          </Button>
          {filename ? (
            <Button type="button" variant="outline" onClick={() => void downloadResume()}>
              <Download />
              下載原檔
            </Button>
          ) : null}
          <Button type="button" variant="ghost" disabled={saving} onClick={() => void clearResume()}>
            清除履歷
          </Button>
        </div>
        {dirty ? <p className="text-xs text-muted-foreground">文字已修改，按儲存履歷後撰寫頁才會用新內容。</p> : null}
        {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
      </div>
    </section>
  );
}

function initialNote(initial: ResumeInitial | null): string {
  if (!initial || (!initial.text && !initial.hasFile)) return "";
  if (initial.hasFile && initial.truncated) return "檔案較長，已放入前 20,000 字，原檔已存進 Supabase。";
  if (initial.hasFile) return `已儲存 ${initial.filename}。解析文字也在 Supabase。`;
  return "履歷文字已存在 Supabase。";
}

function isResume(value: unknown): value is { text: string; filename: string; hasFile: boolean } {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.text === "string" && typeof record.filename === "string" && typeof record.hasFile === "boolean";
}

function readError(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const error = (value as { error?: unknown }).error;
  return typeof error === "string" && error ? error : null;
}

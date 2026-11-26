"use client";

import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";

type Keyword = { text: string; hits: number };

export function KeywordStats() {
  const [keywords, setKeywords] = useState<Keyword[] | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState("");

  useEffect(() => {
    void load(setKeywords, setError);
  }, []);

  async function remove(text: string) {
    setPending(text);
    setError("");
    try {
      const response = await fetch("/api/keywords", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setError(readError(body) ?? "這次沒有移除。");
        return;
      }
      setKeywords((current) => (current ?? []).filter((keyword) => keyword.text !== text));
    } catch {
      setError("這次沒有移除。");
    } finally {
      setPending("");
    }
  }

  return (
    <div className="grid gap-3">
      {error ? (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {keywords?.length === 0 ? (
        <p className="text-sm leading-6 text-muted-foreground">在履歷或職缺說明選取文字，再按加入關鍵字。</p>
      ) : null}
      <ul className="grid gap-2">
        {(keywords ?? []).map((keyword) => (
          <li key={keyword.text} className="flex items-center justify-between gap-3 rounded-lg bg-card px-3 py-2 ring-1 ring-foreground/10">
            <span className="min-w-0">
              <span className="block truncate font-medium">{keyword.text}</span>
              <span className="text-xs text-muted-foreground">投遞命中 {keyword.hits.toLocaleString("zh-Hant")} 次</span>
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending === keyword.text}
              onClick={() => void remove(keyword.text)}
            >
              {pending === keyword.text ? "移除中" : "移除"}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

async function load(
  setKeywords: (keywords: Keyword[]) => void,
  setError: (message: string) => void,
) {
  try {
    const response = await fetch("/api/keywords");
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      setError(readError(body) ?? "讀不到關鍵字。");
      setKeywords([]);
      return;
    }
    setKeywords(readKeywords(body));
  } catch {
    setError("讀不到關鍵字。");
    setKeywords([]);
  }
}

function readKeywords(value: unknown): Keyword[] {
  if (!value || typeof value !== "object") return [];
  const keywords = (value as { keywords?: unknown }).keywords;
  if (!Array.isArray(keywords)) return [];
  return keywords
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const text = (item as { text?: unknown }).text;
      const hits = (item as { hits?: unknown }).hits;
      if (typeof text !== "string" || !text) return null;
      return { text, hits: typeof hits === "number" ? hits : 0 };
    })
    .filter((item): item is Keyword => item !== null);
}

function readError(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const error = (value as { error?: unknown }).error;
  return typeof error === "string" ? error : null;
}

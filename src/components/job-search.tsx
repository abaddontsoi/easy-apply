"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { JOBSDB_COUNTRIES, type JobsdbCountry, type ListedJob } from "@/lib/jobsdb";
import { Search } from "lucide-react";
import { useState } from "react";

export function JobSearch({ onPick }: { onPick: (job: ListedJob) => void }) {
  const [keyword, setKeyword] = useState("");
  const [country, setCountry] = useState<JobsdbCountry>("hongkong");
  const [jobs, setJobs] = useState<ListedJob[]>([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function search() {
    const trimmed = keyword.replace(/\s+/g, " ").trim();
    if (trimmed.length < 2) {
      setError("請輸入至少兩個字的職缺關鍵字。");
      return;
    }
    setSearching(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ keyword: trimmed, country }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setJobs([]);
        setError(readError(payload) ?? "JobsDB 這次沒有完成。請稍後再搜。");
        return;
      }
      const next = readJobs(payload);
      setJobs(next);
      setMessage(next.length === 0 ? "這組條件沒有職缺。可以放寬關鍵字。" : `找到 ${next.length} 筆。點一筆放入職缺說明。`);
    } catch {
      setJobs([]);
      setError("JobsDB 這次沒有完成。請稍後再搜。");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="@container grid gap-3 rounded-lg bg-muted/60 p-3">
      <Label htmlFor="jobsdb-keyword">從 JobsDB 搜尋</Label>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_7.5rem_auto] sm:items-center">
        <Input
          id="jobsdb-keyword"
          value={keyword}
          maxLength={80}
          placeholder="關鍵字，例如 software engineer"
          onChange={(event) => setKeyword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void search();
            }
          }}
        />
        <Select
          value={country}
          items={JOBSDB_COUNTRIES}
          onValueChange={(next) => {
            if (next === "hongkong" || next === "thailand") setCountry(next);
          }}
        >
          <SelectTrigger className="w-full" aria-label="JobsDB 市場">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.entries(JOBSDB_COUNTRIES) as [JobsdbCountry, string][]).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" disabled={searching} onClick={() => void search()}>
          <Search />
          {searching ? "搜尋中" : "搜尋 JobsDB"}
        </Button>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        每次 10 筆，大約要一兩分鐘，並使用你的 Apify 額度。結果留在這一頁，按下撰寫才寫進 Supabase。
      </p>
      {error ? (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      {jobs.length > 0 ? (
        <ul className="grid max-h-64 gap-1 overflow-y-auto">
          {jobs.map((job) => (
            <li key={job.id}>
              <button
                type="button"
                className="w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-background"
                onClick={() => onPick(job)}
              >
                <span className="block truncate font-medium">{job.title}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[job.company, job.location, job.salary].filter(Boolean).join(" · ") || "JobsDB"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function readJobs(value: unknown): ListedJob[] {
  if (!value || typeof value !== "object") return [];
  const jobs = (value as { jobs?: unknown }).jobs;
  if (!Array.isArray(jobs)) return [];
  return jobs.filter(isListedJob);
}

function isListedJob(value: unknown): value is ListedJob {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.title === "string" &&
    typeof record.company === "string" &&
    typeof record.location === "string" &&
    typeof record.salary === "string" &&
    typeof record.url === "string" &&
    typeof record.text === "string"
  );
}

function readError(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const error = (value as { error?: unknown }).error;
  return typeof error === "string" ? error : null;
}

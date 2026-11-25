"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { storeSelectedJob } from "@/lib/selected-job";
import { Link2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function JobSearch() {
  const router = useRouter();
  const [link, setLink] = useState("");
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");

  async function readLink() {
    const url = link.trim();
    if (!url) {
      setError("請貼上 JobsDB 職缺連結。");
      return;
    }
    setReading(true);
    setError("");
    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const payload: unknown = await response.json().catch(() => null);
      const job = readJob(payload);
      if (!response.ok || !job) {
        setError(readError(payload) ?? "JobsDB 這次沒有完成。請稍後再試。");
        return;
      }
      storeSelectedJob({ company: job.company, role: job.role, text: job.text });
      router.push("/");
    } catch {
      setError("JobsDB 這次沒有完成。請稍後再試。");
    } finally {
      setReading(false);
    }
  }

  return (
    <div className="grid gap-3 rounded-lg bg-muted/60 p-3">
      <Label htmlFor="jobsdb-link">JobsDB 職缺連結</Label>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <Input
          id="jobsdb-link"
          value={link}
          inputMode="url"
          maxLength={300}
          placeholder="https://hk.jobsdb.com/job/95749564"
          onChange={(event) => setLink(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void readLink();
            }
          }}
        />
        <Button type="button" variant="outline" disabled={reading} onClick={() => void readLink()}>
          <Link2 />
          {reading ? "讀取中" : "讀取職缺"}
        </Button>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        貼上香港或泰國 JobsDB 的單一職缺頁。讀到之後會開啟一封新信，並帶入公司、職位和職缺說明。
      </p>
      {error ? (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function readJob(value: unknown): { company: string; role: string; text: string } | null {
  if (!value || typeof value !== "object") return null;
  const job = (value as { job?: unknown }).job;
  if (!job || typeof job !== "object") return null;
  const record = job as Record<string, unknown>;
  if (typeof record.company !== "string" || typeof record.role !== "string" || typeof record.text !== "string") {
    return null;
  }
  if (!record.text.trim()) return null;
  return { company: record.company, role: record.role, text: record.text };
}

function readError(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const error = (value as { error?: unknown }).error;
  return typeof error === "string" ? error : null;
}

import { spawn } from "node:child_process";
import { JobsError, extractJobsdbJob, type JobsdbJob } from "@/lib/jobsdb";
import { authenticateCaller } from "@/lib/session";

const PAGE_LIMIT = 1_500_000;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

type PageFetcher = (url: string, init: RequestInit) => Promise<Response>;

let testFetcher: PageFetcher | null = null;

export function setJobsdbFetcherForTests(fetcher: PageFetcher | null): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("JobsDB fetch doubles are unavailable in production.");
  }
  testFetcher = fetcher;
}

export async function readJobsdbPage(url: string): Promise<JobsdbJob> {
  await authenticateCaller();
  const html = await fetchPage(url);
  const job = extractJobsdbJob(html, url);
  if (!job) throw new JobsError("empty");
  return job;
}

async function fetchPage(url: string): Promise<string> {
  try {
    if (testFetcher) return await readResponse(await testFetcher(url, { method: "GET" }), url);
    return await fetchWithCurl(url);
  } catch (error) {
    if (error instanceof JobsError) throw error;
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new JobsError("timeout");
    }
    throw new JobsError("unavailable");
  }
}

async function readResponse(response: Response, url: string): Promise<string> {
  const finalUrl = response.url || url;
  if (!isJobsdbJob(finalUrl)) throw new JobsError("unavailable");
  if (response.status === 403 || response.status === 429) throw new JobsError("blocked");
  if (!response.ok) throw new JobsError("unavailable");
  const length = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(length) && length > PAGE_LIMIT) throw new JobsError("unavailable");
  try {
    return (await response.text()).slice(0, PAGE_LIMIT);
  } catch {
    throw new JobsError("unavailable");
  }
}

function fetchWithCurl(url: string): Promise<string> {
  const command = process.platform === "win32" ? "curl.exe" : "curl";
  return new Promise((resolve, reject) => {
    const child = spawn(
      command,
      [
        "--silent",
        "--show-error",
        "--location",
        "--max-redirs",
        "3",
        "--max-time",
        "15",
        "--user-agent",
        USER_AGENT,
        "--header",
        "accept: text/html,application/xhtml+xml",
        "--write-out",
        "\n%{http_code} %{url_effective}",
        "--output",
        "-",
        url,
      ],
      { shell: false, windowsHide: true },
    );
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let bytes = 0;
    let settled = false;
    const fail = (error: JobsError) => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(error);
    };
    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > PAGE_LIMIT + 64) {
        fail(new JobsError("unavailable"));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr.push(chunk);
    });
    child.on("error", () => fail(new JobsError("unavailable")));
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      const stderrText = Buffer.concat(stderr).toString("utf8");
      if (/timed out|Operation timed out/i.test(stderrText)) {
        reject(new JobsError("timeout"));
        return;
      }
      if (code !== 0 && stdout.length === 0) {
        reject(new JobsError("unavailable"));
        return;
      }
      const raw = Buffer.concat(stdout).toString("utf8");
      const split = raw.lastIndexOf("\n");
      const body = split >= 0 ? raw.slice(0, split) : raw;
      const statusLine = split >= 0 ? raw.slice(split + 1).trim() : "";
      const status = Number(statusLine.slice(0, 3));
      const finalUrl = statusLine.slice(3).trim();
      if (!isJobsdbJob(finalUrl || url)) {
        reject(new JobsError("unavailable"));
        return;
      }
      if (status === 403 || status === 429 || body.includes("Just a moment")) {
        reject(new JobsError("blocked"));
        return;
      }
      if (!Number.isInteger(status) || status < 200 || status >= 300) {
        reject(new JobsError("unavailable"));
        return;
      }
      resolve(body.slice(0, PAGE_LIMIT));
    });
  });
}

function isJobsdbJob(url: string): boolean {
  return url.startsWith("https://hk.jobsdb.com/job/") || url.startsWith("https://th.jobsdb.com/job/");
}

export class JobsError extends Error {
  readonly code: "unavailable" | "timeout" | "empty" | "blocked";

  constructor(code: JobsError["code"]) {
    super(code);
    this.name = "JobsError";
    this.code = code;
  }
}

export type JobsdbJob = {
  id: string;
  title: string;
  company: string;
  location: string;
  workType: string;
  url: string;
  text: string;
};

const HOSTS = new Set(["hk.jobsdb.com", "th.jobsdb.com"]);
const JOB_PATH = /^\/job\/(\d+)\/?$/;

export function parseJobsdbLink(
  value: unknown,
): { ok: true; url: string; id: string } | { ok: false; error: string } {
  if (typeof value !== "string") return { ok: false, error: "請貼上 JobsDB 職缺連結。" };
  const raw = value.trim();
  if (!raw) return { ok: false, error: "請貼上 JobsDB 職缺連結。" };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: "請貼上 JobsDB 職缺連結，例如 https://hk.jobsdb.com/job/95749564" };
  }
  if (url.protocol !== "https:" || url.username || url.password || !HOSTS.has(url.hostname)) {
    return { ok: false, error: "只接受香港或泰國 JobsDB 的職缺連結。" };
  }
  const match = JOB_PATH.exec(url.pathname);
  if (!match) return { ok: false, error: "請貼上單一職缺頁的連結，例如 https://hk.jobsdb.com/job/95749564" };
  const id = match[1] ?? "";
  return { ok: true, id, url: `https://${url.hostname}/job/${id}` };
}

export function extractJobsdbJob(html: string, pageUrl: string): JobsdbJob | null {
  const parsed = parseJobsdbLink(pageUrl);
  if (!parsed.ok) return null;
  const title = oneLine(elementText(html, "job-detail-title"));
  const description = htmlToText(elementInner(html, "jobAdDetails"));
  if (!title || description.length < 40) return null;
  const company = oneLine(elementText(html, "advertiser-name"));
  const location = oneLine(elementText(html, "job-detail-location"));
  const workType = oneLine(elementText(html, "job-detail-work-type"));
  const job = {
    id: parsed.id,
    title: title.slice(0, 180),
    company: company.slice(0, 160),
    location: location.slice(0, 160),
    workType: workType.slice(0, 80),
    url: parsed.url,
    description: description.slice(0, 12_000),
  };
  return { ...job, text: jobText(job) };
}

function jobText(job: {
  title: string;
  company: string;
  location: string;
  workType: string;
  url: string;
  description: string;
}): string {
  const place = [job.company, job.location, job.workType].filter(Boolean).join(" · ");
  const head = [job.title, place, job.url].filter(Boolean);
  return [...head, "", job.description].join("\n").slice(0, 20_000);
}

function elementText(html: string, name: string): string {
  return htmlToText(elementInner(html, name));
}

function elementInner(html: string, name: string): string {
  const marker = `data-automation="${name}"`;
  const at = html.indexOf(marker);
  if (at < 0) return "";
  const open = html.lastIndexOf("<", at);
  if (open < 0) return "";
  const tag = html.slice(open + 1).match(/^[A-Za-z0-9]+/)?.[0]?.toLowerCase();
  if (!tag) return "";
  const contentStart = html.indexOf(">", at);
  if (contentStart < 0) return "";
  const start = contentStart + 1;
  const pattern = new RegExp(`<(/?)${tag}(?=[\\s>/])`, "gi");
  pattern.lastIndex = start;
  let depth = 1;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) {
    const end = html.indexOf(">", match.index);
    if (end < 0) return "";
    if (!html.slice(match.index, end + 1).endsWith("/>")) {
      depth += match[1] === "/" ? -1 : 1;
    }
    if (depth === 0) return html.slice(start, match.index);
    pattern.lastIndex = end + 1;
  }
  return "";
}

function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/(p|div|h[1-6]|tr|ul|ol|li)>/gi, "\n");
  const decoded = decodeEntities(withBreaks.replace(/<[^>]+>/g, ""));
  return decoded
    .replace(/\u0000/g, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, digits: string) => fromCode(Number(digits)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => fromCode(Number.parseInt(hex, 16)));
}

function fromCode(code: number): string {
  if (!Number.isInteger(code) || code <= 0 || code > 0x10ffff) return "";
  return String.fromCodePoint(code);
}

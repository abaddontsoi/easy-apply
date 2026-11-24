export const JOBSDB_ACTOR = "websift/seek-job-scraper";
export const JOBSDB_DATE_RANGE_DAYS = 31;
export const JOBSDB_MIN_RESULTS = 10;
export const JOBSDB_MAX_RESULTS = 20;

export const JOBSDB_COUNTRIES = {
  hongkong: "香港",
  thailand: "泰國",
} as const;

export type JobsdbCountry = keyof typeof JOBSDB_COUNTRIES;

export type JobQuery = {
  country: JobsdbCountry;
  keyword: string;
  location: string;
  maxResults: number;
};

export type ScrapedJob = {
  id: string;
  title: string;
  company: string;
  location: string;
  salary: string;
  workType: string;
  arrangement: string;
  listedAt: string;
  url: string;
  description: string;
};

export type ListedJob = {
  id: string;
  title: string;
  company: string;
  location: string;
  salary: string;
  url: string;
  text: string;
};

export class JobsError extends Error {
  readonly code: "missing_token" | "unavailable" | "timeout";

  constructor(code: JobsError["code"]) {
    super(code);
    this.name = "JobsError";
    this.code = code;
  }
}

export function parseJobQuery(
  value: unknown,
): { ok: true; value: JobQuery } | { ok: false; error: string } {
  if (!value || typeof value !== "object") return { ok: false, error: "請送出搜尋條件。" };
  const body = value as Record<string, unknown>;
  const country = body.country === undefined || body.country === "" ? "hongkong" : body.country;
  if (country !== "hongkong" && country !== "thailand") {
    return { ok: false, error: "JobsDB 只搜尋香港或泰國。" };
  }
  const keyword = collapse(body.keyword);
  if (keyword.length < 2) return { ok: false, error: "請輸入至少兩個字的職缺關鍵字。" };
  if (keyword.length > 80) return { ok: false, error: "關鍵字請少於 80 字。" };
  const location = collapse(body.location);
  if (location.length > 80) return { ok: false, error: "地區請少於 80 字。" };
  return {
    ok: true,
    value: {
      country,
      keyword,
      location,
      maxResults: clampResults(body.maxResults),
    },
  };
}

export function actorInput(query: JobQuery): Record<string, string | number> {
  const input: Record<string, string | number> = {
    searchTerm: query.keyword,
    country: query.country,
    maxResults: query.maxResults,
    sortBy: "ListedDate",
    dateRange: JOBSDB_DATE_RANGE_DAYS,
  };
  if (query.location) input.location = query.location;
  return input;
}

export function normalizeJobs(items: unknown[]): ScrapedJob[] {
  const jobs: ScrapedJob[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const job = normalizeJob(item);
    if (!job || seen.has(job.id)) continue;
    seen.add(job.id);
    jobs.push(job);
  }
  return jobs;
}

export function listJob(job: ScrapedJob): ListedJob {
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    salary: job.salary,
    url: job.url,
    text: jobBrief(job),
  };
}

export function jobBrief(job: ScrapedJob): string {
  const place = [job.company, job.location].filter(Boolean).join(" · ");
  const meta = [job.salary, job.workType, job.arrangement, job.listedAt ? `刊登 ${job.listedAt}` : ""]
    .filter(Boolean)
    .join(" · ");
  const head = [job.title, place, meta, job.url].filter(Boolean);
  const body = job.description.trim();
  return [...head, ...(body ? ["", body] : [])].join("\n").slice(0, 20_000);
}

function normalizeJob(item: unknown): ScrapedJob | null {
  if (!item || typeof item !== "object") return null;
  const record = item as Record<string, unknown>;
  const title = field(record.title, 180);
  const url = httpsUrl(record.jobLink);
  const id = field(record.id, 40) || url;
  if (!title || !id) return null;
  const advertiser = recordOf(record.advertiser);
  const companyProfile = recordOf(record.companyProfile);
  const locationInfo = recordOf(record.joblocationInfo);
  return {
    id,
    title,
    company: field(advertiser.name, 160) || field(companyProfile.name, 160),
    location: field(locationInfo.displayLocation, 160) || field(locationInfo.location, 160),
    salary: field(record.salary, 160),
    workType: fieldList(record.workTypes),
    arrangement: fieldList(record.workArrangements),
    listedAt: listedDay(record.listedAt),
    url,
    description: descriptionFrom(record.content),
  };
}

function descriptionFrom(content: unknown): string {
  const record = recordOf(content);
  const sections = stringList(record.sections);
  if (sections.length > 0) return sections.join("\n\n").slice(0, 12_000);
  const bullets = stringList(record.bulletPoints);
  const html = plainFromHtml(record.unEditedContent);
  return [...bullets, html].filter(Boolean).join("\n\n").slice(0, 12_000);
}

function plainFromHtml(value: unknown): string {
  const html = typeof value === "string" ? value.replace(/\u0000/g, "").slice(0, 50_000) : "";
  if (!html) return "";
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!text || text === "N/A" || text === "None" || text === "null") return "";
  return text.slice(0, 12_000);
}

function listedDay(value: unknown): string {
  const raw = field(value, 40);
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function fieldList(value: unknown): string {
  if (Array.isArray(value)) return stringList(value).join(", ").slice(0, 160);
  return field(value, 160);
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => field(item, 4_000)).filter(Boolean);
}

function recordOf(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function field(value: unknown, max: number): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value).slice(0, max);
  if (typeof value !== "string") return "";
  const trimmed = value.replace(/\u0000/g, "").replace(/\s+/g, " ").trim();
  if (!trimmed || trimmed === "N/A" || trimmed === "None" || trimmed === "null") return "";
  return trimmed.slice(0, max);
}

function httpsUrl(value: unknown): string {
  const raw = field(value, 500);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

function collapse(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

function clampResults(value: unknown): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isInteger(parsed)) return JOBSDB_MIN_RESULTS;
  return Math.min(JOBSDB_MAX_RESULTS, Math.max(JOBSDB_MIN_RESULTS, parsed));
}

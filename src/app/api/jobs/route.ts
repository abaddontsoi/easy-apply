import { allowScrape } from "@/lib/guard";
import { privateJson, readJson } from "@/lib/http";
import { JobsError, parseJobsdbLink } from "@/lib/jobsdb";
import { readJobsdbPage } from "@/lib/read-jobsdb";
import { UnauthenticatedError, requireUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request) {
  const session = await requireUser();
  if (session instanceof Response) return session;

  const body = await readJson(request, 4_000);
  if (!body.ok) return body.response;
  const link = body.value && typeof body.value === "object" ? (body.value as { url?: unknown }).url : null;
  const parsed = parseJobsdbLink(link);
  if (!parsed.ok) return privateJson({ error: parsed.error }, 400);
  if (!allowScrape(session.userId)) {
    return privateJson({ error: "這十分鐘已經讀了三次 JobsDB 連結，請稍後再試。" }, 429);
  }

  try {
    const job = await readJobsdbPage(parsed.url);
    return privateJson({
      job: {
        company: job.company,
        role: job.title,
        url: job.url,
        text: job.text,
      },
    });
  } catch (error) {
    if (error instanceof UnauthenticatedError) return privateJson({ error: "請先登入。" }, 401);
    if (error instanceof JobsError && error.code === "timeout") {
      return privateJson({ error: "讀取 JobsDB 逾時，請稍後再試。" }, 504);
    }
    if (error instanceof JobsError && error.code === "blocked") {
      return privateJson({ error: "JobsDB 擋住了這次讀取。請稍後再試，或直接貼上職缺說明。" }, 502);
    }
    if (error instanceof JobsError && error.code === "empty") {
      return privateJson({ error: "讀不到這則職缺說明。請確認連結仍可公開查看。" }, 422);
    }
    return privateJson({ error: "JobsDB 這次沒有完成。請稍後再試。" }, 502);
  }
}

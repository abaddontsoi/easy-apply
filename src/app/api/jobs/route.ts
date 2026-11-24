import { resolveApifyToken } from "@/lib/credentials";
import { allowScrape } from "@/lib/guard";
import { privateJson, readJson } from "@/lib/http";
import { JobsError, listJob, parseJobQuery } from "@/lib/jobsdb";
import { scrapeJobsdb } from "@/lib/scrape-jobs";
import { requireUser } from "@/lib/session";
import { keysForRequest } from "@/lib/user-keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  const session = await requireUser();
  if (session instanceof Response) return session;

  const body = await readJson(request, 4_000);
  if (!body.ok) return body.response;
  const parsed = parseJobQuery(body.value);
  if (!parsed.ok) return privateJson({ error: parsed.error }, 400);
  const keys = await keysForRequest(session);
  if (keys instanceof Response) return keys;
  if (!allowScrape(session.userId)) {
    return privateJson({ error: "這十分鐘已經搜尋了三次，請稍後再搜。" }, 429);
  }
  const apify = resolveApifyToken(keys.apify);

  try {
    const jobs = (await scrapeJobsdb(parsed.value, keys.apify)).map(listJob);
    return privateJson({ jobs });
  } catch (error) {
    if (error instanceof JobsError && error.code === "missing_token") {
      const message = apify.source === "user"
        ? "你儲存的 Apify 金鑰無法使用，這次沒有改用系統金鑰。"
        : "尚未連接 Apify。請到設定頁儲存金鑰，或在 Infisical 設定 APIFY_TOKEN。";
      return privateJson({ error: message }, 503);
    }
    if (error instanceof JobsError && error.code === "timeout") {
      return privateJson({ error: "JobsDB 搜尋逾時，請稍後再試，或把關鍵字縮窄。" }, 504);
    }
    return privateJson({ error: "JobsDB 這次沒有完成。請稍後再搜。" }, 502);
  }
}

import { ApifyClient } from "apify-client";
import { JOBSDB_ACTOR, JobsError, actorInput, normalizeJobs, type JobQuery, type ScrapedJob } from "@/lib/jobsdb";

export type JobRunner = (input: Record<string, unknown>) => Promise<unknown[]>;

const WAIT_SECS = 240;
const CHARGE_CAP_USD = 0.15;

let testRunner: JobRunner | null = null;

export function setJobRunnerForTests(runner: JobRunner | null): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Job runner doubles are unavailable in production.");
  }
  testRunner = runner;
}

export async function scrapeJobsdb(query: JobQuery): Promise<ScrapedJob[]> {
  const items = await (testRunner ?? runWithApify)(actorInput(query));
  return normalizeJobs(items);
}

async function runWithApify(input: Record<string, unknown>): Promise<unknown[]> {
  const token = readApifyToken();
  if (!token) throw new JobsError("missing_token");
  const client = new ApifyClient({ token });
  const maxResults = typeof input.maxResults === "number" ? input.maxResults : 10;
  let run;
  try {
    run = await client.actor(JOBSDB_ACTOR).call(input, {
      waitSecs: WAIT_SECS,
      timeout: WAIT_SECS,
      memory: 256,
      maxItems: maxResults,
      maxTotalChargeUsd: CHARGE_CAP_USD,
      log: null,
    });
  } catch {
    throw new JobsError("unavailable");
  }
  if (run.status !== "SUCCEEDED" || !run.defaultDatasetId) {
    if (run.status === "RUNNING" || run.status === "READY") {
      await client.run(run.id).abort().catch(() => undefined);
      throw new JobsError("timeout");
    }
    throw new JobsError("unavailable");
  }
  try {
    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    return items;
  } catch {
    throw new JobsError("unavailable");
  }
}

function readApifyToken(): string | null {
  let token = process.env.APIFY_TOKEN?.trim() ?? "";
  if (
    (token.startsWith("\"") && token.endsWith("\"")) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    token = token.slice(1, -1).trim();
  }
  if (!token || /\s/.test(token)) return null;
  return token;
}

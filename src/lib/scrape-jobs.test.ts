import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { JobsError } from "./jobsdb";
import { scrapeJobsdb, setJobRunnerForTests } from "./scrape-jobs";

const query = {
  country: "hongkong" as const,
  keyword: "software engineer",
  location: "",
  maxResults: 10,
};

const savedToken = process.env.APIFY_TOKEN;

describe("scrapeJobsdb", () => {
  afterEach(() => {
    setJobRunnerForTests(null);
    if (savedToken === undefined) delete process.env.APIFY_TOKEN;
    else process.env.APIFY_TOKEN = savedToken;
  });

  it("uses the injected runner and does not need a token", async () => {
    const captured: { input?: Record<string, unknown> } = {};
    setJobRunnerForTests(async (input) => {
      captured.input = input;
      return [
        {
          id: "1",
          title: "Platform Engineer",
          advertiser: { name: "Harbor" },
          jobLink: "https://hk.jobsdb.com/job/1",
          content: { sections: ["Keep the queue healthy."] },
        },
      ];
    });
    process.env.APIFY_TOKEN = "should-not-be-read";
    const jobs = await scrapeJobsdb(query);
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0]?.title, "Platform Engineer");
    assert.equal(captured.input?.country, "hongkong");
    assert.equal(captured.input?.searchTerm, "software engineer");
  });

  it("stops before Apify when APIFY_TOKEN is missing", async () => {
    delete process.env.APIFY_TOKEN;
    setJobRunnerForTests(null);
    await assert.rejects(
      () => scrapeJobsdb(query),
      (error: unknown) => error instanceof JobsError && error.code === "missing_token",
    );
  });
});

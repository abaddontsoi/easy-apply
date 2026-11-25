import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { JobsError } from "./jobsdb";
import { readJobsdbPage, setJobsdbFetcherForTests } from "./read-jobsdb";
import { UnauthenticatedError } from "./session";
import { allowServiceUserForTests, setSupabaseTestDoubles } from "./supabase";

const PAGE = `<h1 data-automation="job-detail-title">Software Engineer</h1>
<span data-automation="advertiser-name">Northwind</span>
<div data-automation="jobAdDetails"><p>Design backend services using Golang and keep the launch calendar for 1,200 teams.</p></div>`;

describe("readJobsdbPage", () => {
  beforeEach(() => {
    allowServiceUserForTests();
  });

  afterEach(() => {
    setSupabaseTestDoubles(null);
    setJobsdbFetcherForTests(null);
  });

  it("reads the posting through the injected fetcher", async () => {
    setJobsdbFetcherForTests(async (url) => {
      assert.equal(url, "https://hk.jobsdb.com/job/95749564");
      return new Response(PAGE, { status: 200, headers: { "content-type": "text/html" } });
    });
    const job = await readJobsdbPage("https://hk.jobsdb.com/job/95749564");
    assert.equal(job.company, "Northwind");
    assert.match(job.text, /1,200 teams/);
  });

  it("does not fetch when the caller is signed out", async () => {
    setSupabaseTestDoubles(null);
    let called = false;
    setJobsdbFetcherForTests(async () => {
      called = true;
      return new Response(PAGE, { status: 200 });
    });
    await assert.rejects(readJobsdbPage("https://hk.jobsdb.com/job/1"), (error: unknown) => error instanceof UnauthenticatedError);
    assert.equal(called, false);
  });

  it("reports a timeout, a Cloudflare block, and a page that left JobsDB", async () => {
    setJobsdbFetcherForTests(async () => {
      const error = new Error("timed out");
      error.name = "TimeoutError";
      throw error;
    });
    await assert.rejects(readJobsdbPage("https://hk.jobsdb.com/job/1"), (error: unknown) => {
      assert.ok(error instanceof JobsError);
      assert.equal(error.code, "timeout");
      return true;
    });

    setJobsdbFetcherForTests(async () => new Response("Just a moment", { status: 403 }));
    await assert.rejects(readJobsdbPage("https://hk.jobsdb.com/job/1"), (error: unknown) => {
      assert.ok(error instanceof JobsError);
      assert.equal(error.code, "blocked");
      return true;
    });

    setJobsdbFetcherForTests(async () => {
      const response = new Response(PAGE, { status: 200 });
      Object.defineProperty(response, "url", { value: "https://evil.example/job/1" });
      return response;
    });
    await assert.rejects(readJobsdbPage("https://hk.jobsdb.com/job/1"), (error: unknown) => {
      assert.ok(error instanceof JobsError);
      assert.equal(error.code, "unavailable");
      return true;
    });
  });
});

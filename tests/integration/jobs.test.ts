import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { POST as searchJobs } from "../../src/app/api/jobs/route";
import { JobsError } from "../../src/lib/jobsdb";
import { setJobRunnerForTests } from "../../src/lib/scrape-jobs";
import { USER_A, configureTestEnv, installDesk, installTestEnv, jsonRequest, readPayload } from "./harness";

installTestEnv();

const listing = {
  id: "86136632",
  title: "Software Engineer",
  salary: "HK$40,000",
  advertiser: { name: "Northwind" },
  joblocationInfo: { displayLocation: "Central" },
  jobLink: "https://hk.jobsdb.com/job/86136632",
  content: { sections: ["Build the billing API."] },
};

describe("jobs route", { concurrency: 1 }, () => {
  it("rejects a signed-out search and a short keyword", async () => {
    configureTestEnv();
    const desk = installDesk([USER_A]);
    desk.signInAs(null);
    const signedOut = await searchJobs(
      jsonRequest("http://127.0.0.1/api/jobs", { keyword: "engineer", country: "hongkong" }),
    );
    assert.equal(signedOut.status, 401);

    desk.signInAs(USER_A.id);
    const short = await searchJobs(jsonRequest("http://127.0.0.1/api/jobs", { keyword: "a" }));
    assert.equal(short.status, 400);
    assert.match(String((await readPayload(short)).error), /關鍵字/);
  });

  it("returns JobsDB listings from the actor runner", async () => {
    configureTestEnv();
    installDesk([USER_A]);
    setJobRunnerForTests(async (input) => {
      assert.equal(input.country, "thailand");
      assert.equal(input.searchTerm, "accountant");
      return [listing, { title: "" }];
    });
    const response = await searchJobs(
      jsonRequest("http://127.0.0.1/api/jobs", { keyword: "accountant", country: "thailand" }),
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const body = await readPayload(response);
    const jobs = body.jobs as { title: string; company: string; text: string }[];
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0]?.title, "Software Engineer");
    assert.equal(jobs[0]?.company, "Northwind");
    assert.match(jobs[0]?.text ?? "", /billing API/);
  });

  it("names APIFY_TOKEN when the token is missing and maps actor failures", async () => {
    configureTestEnv();
    installDesk([USER_A]);
    const missing = await searchJobs(jsonRequest("http://127.0.0.1/api/jobs", { keyword: "engineer" }));
    assert.equal(missing.status, 503);
    const missingBody = await readPayload(missing);
    assert.match(String(missingBody.error), /APIFY_TOKEN/);
    assert.doesNotMatch(String(missingBody.error), /apify_api_/);

    setJobRunnerForTests(async () => {
      throw new JobsError("timeout");
    });
    const timedOut = await searchJobs(jsonRequest("http://127.0.0.1/api/jobs", { keyword: "engineer" }));
    assert.equal(timedOut.status, 504);

    setJobRunnerForTests(async () => {
      throw new JobsError("unavailable");
    });
    const failed = await searchJobs(jsonRequest("http://127.0.0.1/api/jobs", { keyword: "engineer" }));
    assert.equal(failed.status, 502);
  });
});

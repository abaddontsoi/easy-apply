import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { POST as readJob } from "../../src/app/api/jobs/route";
import { setJobsdbFetcherForTests } from "../../src/lib/read-jobsdb";
import { USER_A, configureTestEnv, installDesk, installTestEnv, jsonRequest, readPayload } from "./harness";

installTestEnv();

const PAGE = `<h1 data-automation="job-detail-title">Software Engineer</h1>
<span data-automation="advertiser-name">Northwind</span>
<span data-automation="job-detail-location">Central</span>
<div data-automation="jobAdDetails"><p>Build the billing API and keep the launch calendar for 1,200 teams.</p></div>`;

describe("jobs route", { concurrency: 1 }, () => {
  it("rejects a signed-out request and a link that is not a JobsDB posting", async () => {
    configureTestEnv();
    const desk = installDesk([USER_A]);
    desk.signInAs(null);
    const signedOut = await readJob(jsonRequest("http://127.0.0.1/api/jobs", { url: "https://hk.jobsdb.com/job/95749564" }));
    assert.equal(signedOut.status, 401);

    desk.signInAs(USER_A.id);
    const search = await readJob(jsonRequest("http://127.0.0.1/api/jobs", { url: "https://hk.jobsdb.com/software-engineer-jobs" }));
    assert.equal(search.status, 400);
    assert.match(String((await readPayload(search)).error), /職缺/);
  });

  it("returns the posting from the page fetcher", async () => {
    configureTestEnv();
    installDesk([USER_A]);
    setJobsdbFetcherForTests(async () => new Response(PAGE, { status: 200 }));
    const response = await readJob(
      jsonRequest("http://127.0.0.1/api/jobs", { url: "https://hk.jobsdb.com/job/95749564/" }),
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const body = await readPayload(response);
    const job = body.job as { company?: string; role?: string; text?: string };
    assert.equal(job.company, "Northwind");
    assert.equal(job.role, "Software Engineer");
    assert.match(job.text ?? "", /billing API/);
    assert.match(job.text ?? "", /https:\/\/hk\.jobsdb\.com\/job\/95749564/);
  });

  it("maps a timeout and a page without a description", async () => {
    configureTestEnv();
    installDesk([USER_A]);
    setJobsdbFetcherForTests(async () => {
      const error = new Error("timed out");
      error.name = "TimeoutError";
      throw error;
    });
    const timedOut = await readJob(jsonRequest("http://127.0.0.1/api/jobs", { url: "https://hk.jobsdb.com/job/95749564" }));
    assert.equal(timedOut.status, 504);

    setJobsdbFetcherForTests(async () => new Response("<html></html>", { status: 200 }));
    const empty = await readJob(jsonRequest("http://127.0.0.1/api/jobs", { url: "https://th.jobsdb.com/job/42" }));
    assert.equal(empty.status, 422);
    assert.match(String((await readPayload(empty)).error), /讀不到這則職缺/);
  });
});

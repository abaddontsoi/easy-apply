import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractJobsdbJob, parseJobsdbLink } from "./jobsdb";

const PAGE = `
<h1 data-automation="job-detail-title">Software Engineer, Backend</h1>
<span data-automation="advertiser-name">Osmium Consulting Group Limited<!-- --> <span><svg></svg></span></span>
<span data-automation="job-detail-location"><a href="/area">Tsim Sha Tsui</a></span>
<span data-automation="job-detail-work-type"><a href="/full-time">Full time</a></span>
<div data-automation="jobAdDetails"><div><p><strong>Job Responsibilities</strong></p><ul><li><p>Design backend services using Golang and Java.</p></li></ul><p>Requirements &amp; notes.</p></div></div>
`;

describe("parseJobsdbLink", () => {
  it("accepts a Hong Kong or Thailand job page and drops the query", () => {
    const hongKong = parseJobsdbLink("  https://hk.jobsdb.com/job/95749564/?type=standard#top  ");
    assert.equal(hongKong.ok, true);
    if (!hongKong.ok) return;
    assert.equal(hongKong.id, "95749564");
    assert.equal(hongKong.url, "https://hk.jobsdb.com/job/95749564");

    const thailand = parseJobsdbLink("https://th.jobsdb.com/job/42/");
    assert.equal(thailand.ok, true);
    if (thailand.ok) assert.equal(thailand.url, "https://th.jobsdb.com/job/42");
  });

  it("rejects search pages and other hosts", () => {
    assert.equal(parseJobsdbLink("https://hk.jobsdb.com/jobs").ok, false);
    assert.equal(parseJobsdbLink("https://www.jobsdb.com/job/95749564").ok, false);
    assert.equal(parseJobsdbLink("http://hk.jobsdb.com/job/95749564").ok, false);
    assert.equal(parseJobsdbLink("https://user:pass@hk.jobsdb.com/job/95749564").ok, false);
    assert.equal(parseJobsdbLink("https://hk.jobsdb.com.evil.example/job/95749564").ok, false);
    const missing = parseJobsdbLink("");
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.match(missing.error, /職缺連結/);
  });
});

describe("extractJobsdbJob", () => {
  it("reads the title, company, and description from the job page", () => {
    const job = extractJobsdbJob(PAGE, "https://hk.jobsdb.com/job/95749564");
    assert.ok(job);
    assert.equal(job?.title, "Software Engineer, Backend");
    assert.equal(job?.company, "Osmium Consulting Group Limited");
    assert.equal(job?.location, "Tsim Sha Tsui");
    assert.equal(job?.workType, "Full time");
    assert.match(job?.text ?? "", /Design backend services using Golang and Java/);
    assert.match(job?.text ?? "", /Requirements & notes/);
    assert.match(job?.text ?? "", /https:\/\/hk\.jobsdb\.com\/job\/95749564/);
    assert.doesNotMatch(job?.text ?? "", /<p>/);
  });

  it("returns nothing when the posting has no description", () => {
    assert.equal(extractJobsdbJob("<h1 data-automation=\"job-detail-title\">Role</h1>", "https://hk.jobsdb.com/job/1"), null);
  });
});

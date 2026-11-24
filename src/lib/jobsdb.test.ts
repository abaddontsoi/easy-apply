import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  JOBSDB_ACTOR,
  actorInput,
  jobBrief,
  listJob,
  normalizeJobs,
  parseJobQuery,
} from "./jobsdb";

const LISTING = {
  id: "86136632",
  title: "Software Engineer",
  salary: "N/A",
  workTypes: "Full Time",
  workArrangements: ["Hybrid"],
  jobLink: "https://hk.jobsdb.com/job/86136632",
  listedAt: "2026-11-01T23:46:54.688Z",
  advertiser: { name: "Northwind" },
  companyProfile: { name: "N/A" },
  joblocationInfo: { displayLocation: "Central, Hong Kong", location: "Hong Kong" },
  content: {
    sections: ["Build the billing API.", "Three years of TypeScript."],
    unEditedContent: "<p>ignored when sections exist</p>",
  },
};

describe("parseJobQuery", () => {
  it("defaults to Hong Kong JobsDB and clamps the result count", () => {
    const parsed = parseJobQuery({ keyword: "  software   engineer ", location: " Central ", maxResults: 50 });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.deepEqual(parsed.value, {
      country: "hongkong",
      keyword: "software engineer",
      location: "Central",
      maxResults: 20,
    });
    const input = actorInput(parsed.value);
    assert.deepEqual(input, {
      searchTerm: "software engineer",
      country: "hongkong",
      maxResults: 20,
      requireEmail: false,
      requirePhone: false,
      requireEmailPhone: false,
      includeOneInTitle: [],
      location: "Central",
      workTypes: [],
      workArrangements: [],
      subclassifications: false,
    });
    assert.equal("accounting" in input, false);
    assert.equal("searchUrl" in input, false);
    assert.equal(JOBSDB_ACTOR, "websift/seek-job-scraper");
  });

  it("accepts Thailand and rejects other actor countries", () => {
    const thailand = parseJobQuery({ keyword: "accountant", country: "thailand", maxResults: "12" });
    assert.equal(thailand.ok, true);
    if (thailand.ok) {
      assert.equal(thailand.value.country, "thailand");
      const input = actorInput(thailand.value);
      assert.equal(input.country, "thailand");
      assert.equal(input.searchTerm, "accountant");
      assert.equal(input.maxResults, 12);
      assert.equal(input.requireEmail, false);
    }

    const australia = parseJobQuery({ keyword: "engineer", country: "australia" });
    assert.equal(australia.ok, false);
    if (!australia.ok) assert.match(australia.error, /香港或泰國/);

    const short = parseJobQuery({ keyword: "a" });
    assert.equal(short.ok, false);
  });
});

describe("normalizeJobs", () => {
  it("turns a JobsDB listing into a letter brief and drops empty rows", () => {
    const jobs = normalizeJobs([
      LISTING,
      { ...LISTING },
      { title: "N/A", jobLink: "http://hk.jobsdb.com/job/1" },
      {
        id: 99,
        title: "Support Analyst",
        salary: "HK$25,000 - HK$30,000",
        jobLink: "not a url",
        content: { unEditedContent: "<p>Answer tickets.</p><p>SQL &amp; Excel</p>" },
      },
    ]);
    assert.equal(jobs.length, 2);
    assert.equal(jobs[0]?.company, "Northwind");
    assert.equal(jobs[0]?.salary, "");
    assert.equal(jobs[0]?.arrangement, "Hybrid");
    assert.equal(jobs[0]?.listedAt, "2026-11-01");
    assert.equal(jobs[0]?.url, "https://hk.jobsdb.com/job/86136632");
    assert.match(jobs[0]?.description ?? "", /billing API/);
    assert.doesNotMatch(jobs[0]?.description ?? "", /ignored/);

    const listed = listJob(jobs[0]!);
    assert.match(listed.text, /Northwind · Central, Hong Kong/);
    assert.match(listed.text, /刊登 2026-11-01/);
    assert.equal(listed.text, jobBrief(jobs[0]!));

    assert.equal(jobs[1]?.id, "99");
    assert.equal(jobs[1]?.url, "");
    assert.match(jobs[1]?.description ?? "", /SQL & Excel/);
  });
});

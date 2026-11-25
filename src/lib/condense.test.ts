import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SOURCE_CHAR_CAP,
  SOURCE_TOKEN_BUDGET,
  condenseDeterministic,
  estimateTokens,
  fitSources,
  splitForRewrite,
} from "./condense";

describe("source condensing", () => {
  it("counts a Han character as one token and four other characters as one", () => {
    assert.equal(estimateTokens("abcd"), 1);
    assert.equal(estimateTokens("履歷"), 2);
    assert.equal(estimateTokens("ab履"), 2);
  });

  it("keeps a short résumé and job description out of the rewrite call", async () => {
    let calls = 0;
    const fitted = await fitSources("Chloe Chan\nOperations lead.", "Own the launch calendar.", async () => {
      calls += 1;
      return "should not be used";
    });
    assert.equal(calls, 0);
    assert.equal(fitted.resume, "Chloe Chan\nOperations lead.");
    assert.equal(fitted.jobDescription, "Own the launch calendar.");
  });

  it("replaces an oversized résumé with the rewrite and leaves a short job description", async () => {
    const resume = `Chloe Chan\n${"負責產品發布日曆。".repeat(1_200)}`;
    assert.ok(estimateTokens(resume) > SOURCE_TOKEN_BUDGET.resume);
    const calls: string[] = [];
    const fitted = await fitSources(resume, "Own the launch calendar for 1,200 teams.", async (_system, user) => {
      calls.push(user);
      return "Chloe Chan\nNorthwind — ran the launch calendar for 1,200 teams.";
    });
    assert.ok(calls.length >= 1);
    assert.match(calls[0] ?? "", /Compress this résumé/);
    assert.match(calls[0] ?? "", /負責產品發布日曆/);
    assert.match(fitted.resume, /1,200 teams/);
    assert.doesNotMatch(fitted.resume, /負責產品發布日曆/);
    assert.equal(fitted.jobDescription, "Own the launch calendar for 1,200 teams.");
    assert.ok(fitted.resume.length <= SOURCE_CHAR_CAP.resume);
  });

  it("keeps a factual excerpt when the rewrite comes back empty", async () => {
    const resume = `Chloe Chan\nKept metric 1,200 teams.\n${"經歷".repeat(5_000)}`;
    const fitted = await fitSources(resume, "Own the calendar.", async () => "  ");
    assert.match(fitted.resume, /Chloe Chan/);
    assert.match(fitted.resume, /1,200/);
    assert.ok(fitted.resume.length <= SOURCE_CHAR_CAP.resume);
    assert.ok(estimateTokens(fitted.resume) <= SOURCE_TOKEN_BUDGET.resume);
  });

  it("stops when the model rejects the key", async () => {
    const resume = "歷".repeat(SOURCE_TOKEN_BUDGET.resume + 1);
    await assert.rejects(
      fitSources(resume, "Own the calendar.", async () => {
        throw Object.assign(new Error("unauthorized"), { code: "unauthorized" });
      }),
      (error: unknown) =>
        Boolean(error && typeof error === "object" && (error as { code?: string }).code === "unauthorized"),
    );
  });

  it("splits a long source on paragraph boundaries and hard-cuts an oversized block", () => {
    const first = "a".repeat(80);
    const second = "b".repeat(80);
    const third = "c".repeat(80);
    const packed = splitForRewrite([first, second, third].join("\n\n"), 170);
    assert.deepEqual(packed, [`${first}\n\n${second}`, third]);
    const cut = splitForRewrite("x".repeat(25), 10);
    assert.deepEqual(cut, ["x".repeat(10), "x".repeat(10), "x".repeat(5)]);
  });

  it("keeps the opening identity and a metric line inside the character cap", () => {
    const lines = ["Chloe Chan", "chloe.chan@example.com", ...Array.from({ length: 40 }, (_, index) => `Duty ${index} with no number`)];
    lines.splice(8, 0, "- Ran the launch calendar for 1,200 teams at Northwind Studio.");
    const brief = condenseDeterministic(lines.join("\n"), 280);
    assert.match(brief, /^Chloe Chan/);
    assert.match(brief, /1,200 teams/);
    assert.doesNotMatch(brief, /Duty 39/);
    assert.ok(brief.length <= 280);
  });
});

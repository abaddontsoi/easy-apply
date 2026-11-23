import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { composeStructured } from "./compose";
import { parseDraftInput, type DraftInput } from "./draft";
import { SAMPLE_JOB, SAMPLE_RESUME } from "./sample";

function input(overrides: Partial<DraftInput> = {}): DraftInput {
  return {
    resume: SAMPLE_RESUME,
    jobDescription: SAMPLE_JOB,
    company: "Lumen Ledger",
    role: "Operations Manager",
    hiringManager: "",
    tone: "professional",
    length: "letter",
    language: "en",
    format: "both",
    provider: "grok",
    ...overrides,
  };
}

describe("composeStructured", () => {
  it("uses a résumé fact and leaves unsupported requirements out of the letter", () => {
    const draft = composeStructured(input());
    assert.match(draft.letter, /1,200 teams/);
    assert.match(draft.letter, /Chloe Chan/);
    assert.match(draft.letter, /chloe\.chan@example\.com/);
    assert.doesNotMatch(draft.letter, /kubernetes/i);
    assert.doesNotMatch(draft.email, /kubernetes/i);
    assert.ok(draft.omissions.some((line) => /kubernetes/i.test(line)));
    assert.equal(draft.mode, "structured");
  });

  it("does not name a company that was only implied", () => {
    const draft = composeStructured(input({ company: "", role: "", hiringManager: "" }));
    assert.doesNotMatch(draft.letter, /Lumen Ledger/);
    assert.match(draft.letter, /Dear Hiring Manager/);
    assert.match(draft.letter, /I ran the quarterly launch calendar/);
  });

  it("writes Traditional Chinese framing around an English résumé", () => {
    const draft = composeStructured(
      input({ language: "zh-Hant", hiringManager: "林先生", format: "letter" }),
    );
    assert.match(draft.letter, /林先生您好/);
    assert.match(draft.notice, /沒有翻譯/);
    assert.equal(draft.email, "");
    assert.match(draft.subject, /Operations Manager/);
  });

  it("uses 敬啟者 when no recipient is named", () => {
    const draft = composeStructured(input({ language: "zh-Hant", format: "email" }));
    assert.match(draft.email, /敬啟者/);
    assert.equal(draft.letter, "");
  });
});

describe("parseDraftInput", () => {
  it("rejects a résumé that is too short", () => {
    const parsed = parseDraftInput({
      ...input(),
      resume: "Too short",
    });
    assert.equal(parsed.ok, false);
  });

  it("keeps a valid request and clips a long company name", () => {
    const parsed = parseDraftInput({
      ...input(),
      company: "Lumen ".repeat(40),
    });
    assert.equal(parsed.ok, true);
    if (parsed.ok) assert.ok(parsed.value.company.length <= 120);
  });

  it("rejects an unknown model", () => {
    const parsed = parseDraftInput({ ...input(), provider: "openai" });
    assert.equal(parsed.ok, false);
  });
});

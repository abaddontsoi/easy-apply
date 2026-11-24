import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LIMITS, parseDraftInput, parseLetterId, parseRevision, parseSavedLetter } from "./draft";

const LETTER_ID = "123e4567-e89b-42d3-a456-426614174000";

function request(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    resume: "a".repeat(LIMITS.minText),
    jobDescription: "b".repeat(LIMITS.minText),
    company: "Lumen Ledger",
    role: "Operations Manager",
    hiringManager: "Lin",
    tone: "professional",
    length: "letter",
    language: "en",
    format: "both",
    provider: "grok",
    ...overrides,
  };
}

describe("parseDraftInput", () => {
  it("rejects a missing body and a short job description", () => {
    assert.equal(parseDraftInput(null).ok, false);
    assert.equal(parseDraftInput("resume").ok, false);
    const short = parseDraftInput(request({ jobDescription: "b".repeat(LIMITS.minText - 1) }));
    assert.equal(short.ok, false);
    if (!short.ok) assert.match(short.error, /再多寫一點/);
  });

  it("rejects text over the limit and unknown choices", () => {
    const long = parseDraftInput(request({ resume: "a".repeat(LIMITS.resume + 1) }));
    assert.equal(long.ok, false);
    if (!long.ok) assert.match(long.error, /20,000/);
    for (const field of ["tone", "length", "language", "format", "provider"] as const) {
      assert.equal(parseDraftInput(request({ [field]: "nope" })).ok, false);
    }
  });

  it("strips null bytes and collapses a field to 120 characters", () => {
    const parsed = parseDraftInput(
      request({
        resume: `${"a".repeat(LIMITS.minText)}\u0000kept`,
        company: "  North   Wind  ",
        role: ` ${"R".repeat(200)} `,
      }),
    );
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.match(parsed.value.resume, /kept/);
    assert.doesNotMatch(parsed.value.resume, /\u0000/);
    assert.equal(parsed.value.company, "North Wind");
    assert.equal(parsed.value.role.length, LIMITS.field);
  });
});

describe("parseRevision", () => {
  it("ignores a blank instruction and rejects one that is too long", () => {
    assert.deepEqual(parseRevision(request()), { ok: true, revision: null });
    assert.deepEqual(parseRevision(request({ instruction: "   " })), { ok: true, revision: null });
    const long = parseRevision(request({ instruction: "改".repeat(LIMITS.instruction + 1) }));
    assert.equal(long.ok, false);
    if (!long.ok) assert.match(long.error, /300/);
    const parsed = parseRevision(
      request({
        instruction: "  把開頭寫短  ",
        mode: "nope",
        subject: "s".repeat(200),
        letter: "現有的信",
        email: "",
      }),
    );
    assert.equal(parsed.ok, true);
    if (!parsed.ok || !parsed.revision) return;
    assert.equal(parsed.revision.instruction, "把開頭寫短");
    assert.equal(parsed.revision.mode, "structured");
    assert.equal(parsed.revision.subject.length, 180);
    assert.equal(parsed.revision.letter, "現有的信");
  });
});

describe("parseLetterId", () => {
  it("accepts an empty id and a uuid, and rejects anything else", () => {
    assert.deepEqual(parseLetterId(null), { ok: true, id: null });
    assert.deepEqual(parseLetterId(""), { ok: true, id: null });
    assert.deepEqual(parseLetterId(LETTER_ID), { ok: true, id: LETTER_ID });
    assert.equal(parseLetterId("00000000-0000-0000-0000-000000000000").ok, false);
    assert.equal(parseLetterId("not-a-uuid").ok, false);
    assert.equal(parseLetterId(12).ok, false);
  });
});

describe("parseSavedLetter", () => {
  it("keeps model prose, clips lists, and rejects a bad id", () => {
    const facts = Array.from({ length: 9 }, (_, index) => ` fact ${index} `);
    facts[0] = "x".repeat(300);
    const parsed = parseSavedLetter(
      request({
        letterId: LETTER_ID,
        mode: "model",
        subject: "s".repeat(200),
        letter: "L".repeat(8_100),
        email: "Email body",
        usedFacts: ["", 12, ...facts],
        omissions: "nope",
        notice: "n".repeat(600),
      }),
    );
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.value.letterId, LETTER_ID);
    assert.equal(parsed.value.mode, "model");
    assert.equal(parsed.value.subject.length, 180);
    assert.equal(parsed.value.letter.length, 8_000);
    assert.equal(parsed.value.usedFacts.length, 8);
    assert.equal(parsed.value.usedFacts[0]?.length, 240);
    assert.deepEqual(parsed.value.omissions, []);
    assert.equal(parsed.value.notice.length, 500);
    assert.equal(parseSavedLetter(request({ letterId: "bad" })).ok, false);
  });

  it("treats an unknown mode as a structured draft", () => {
    const parsed = parseSavedLetter(request({ mode: "invented" }));
    assert.equal(parsed.ok, true);
    if (parsed.ok) assert.equal(parsed.value.mode, "structured");
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DraftInput, DraftOutput } from "./draft";
import { listLetters, readLetter, removeLetter, saveLetter } from "./letters";
import { createMemoryDataClient, type MemoryLetter } from "./memory-letters";
import type { Session } from "./session";

const USER_A = "user-a";
const USER_B = "user-b";
const LETTER_A = "123e4567-e89b-42d3-a456-426614174000";
const LETTER_B = "123e4567-e89b-42d3-a456-426614174001";

describe("letter mapping", () => {
  it("maps a stored row and drops a row the desk cannot render", async () => {
    const older = "11111111-1111-4111-8111-111111111111";
    const rows = [
      row(USER_A, older, { updated_at: "2020-01-01T00:00:00.000Z", role: "Older" }),
      row(USER_A, LETTER_A, { omissions: "not-a-list" }),
      row(USER_A, LETTER_B, { provider: "openai" }),
    ];
    const listed = await listLetters(session(USER_A, rows));
    assert.ok(!(listed instanceof Response));
    if (listed instanceof Response) return;
    assert.deepEqual(
      listed.map((item) => item.id),
      [LETTER_A, older],
    );
    assert.equal(listed[0]?.updatedAt, "2026-01-02T03:04:05.000Z");
    assert.equal(listed[0]?.provider, "grok");

    const stored = await readLetter(session(USER_A, rows), LETTER_A);
    assert.ok(!(stored instanceof Response));
    if (stored instanceof Response) return;
    assert.equal(stored.jobDescription, "Keep the launch calendar.");
    assert.deepEqual(stored.usedFacts, ["Ran the calendar"]);
    assert.deepEqual(stored.omissions, []);
    assert.equal(stored.mode, "structured");
  });

  it("hides another user's letter from list, read, update, and delete", async () => {
    const rows = [row(USER_A, LETTER_A), row(USER_B, LETTER_B, { role: "Other role" })];
    const listed = await listLetters(session(USER_B, rows));
    assert.ok(!(listed instanceof Response));
    if (listed instanceof Response) return;
    assert.deepEqual(
      listed.map((item) => item.id),
      [LETTER_B],
    );

    const hidden = await readLetter(session(USER_B, rows), LETTER_A);
    assert.ok(hidden instanceof Response);
    if (hidden instanceof Response) assert.equal(hidden.status, 404);

    const updated = await saveLetter(session(USER_B, rows), LETTER_A, draftInput(), draftOutput());
    assert.ok(updated instanceof Response);
    if (updated instanceof Response) assert.equal(updated.status, 404);
    assert.equal(rows.find((item) => item.id === LETTER_A)?.role, "Operations Manager");
    assert.equal(rows.find((item) => item.id === LETTER_A)?.user_id, USER_A);

    const removed = await removeLetter(session(USER_B, rows), LETTER_A);
    assert.ok(removed instanceof Response);
    if (removed instanceof Response) assert.equal(removed.status, 404);
    assert.equal(rows.some((item) => item.id === LETTER_A), true);
  });

  it("returns 500 when a row is incomplete or the table is missing", async () => {
    const incomplete = await readLetter(session(USER_A, [row(USER_A, LETTER_A, { tone: "loud" })]), LETTER_A);
    assert.ok(incomplete instanceof Response);
    if (incomplete instanceof Response) {
      assert.equal(incomplete.status, 500);
      assert.match(await errorText(incomplete), /不完整/);
    }

    const missing = await listLetters(session(USER_A, [], "PGRST205"));
    assert.ok(missing instanceof Response);
    if (missing instanceof Response) {
      assert.equal(missing.status, 500);
      assert.match(await errorText(missing), /letters 資料表/);
    }

    const failed = await listLetters(session(USER_A, [], "XX000"));
    assert.ok(failed instanceof Response);
    if (failed instanceof Response) assert.match(await errorText(failed), /沒有存成/);
  });

  it("stops a new letter at 100 rows for that user only", async () => {
    const rows = Array.from({ length: 100 }, (_, index) => row(USER_A, idFor(index)));
    rows.push(row(USER_B, LETTER_B));
    const blocked = await saveLetter(session(USER_A, rows), null, draftInput(), draftOutput());
    assert.ok(blocked instanceof Response);
    if (blocked instanceof Response) assert.equal(blocked.status, 409);

    const saved = await saveLetter(session(USER_B, rows), null, draftInput(), draftOutput());
    assert.ok(!(saved instanceof Response));
    if (saved instanceof Response) return;
    const created = rows.find((item) => item.id === saved.id);
    assert.equal(created?.user_id, USER_B);
    assert.equal(rows.filter((item) => item.user_id === USER_A).length, 100);
  });
});

function session(userId: string, rows: MemoryLetter[], errorCode?: string): Session {
  return {
    data: createMemoryDataClient(rows, errorCode ? { errorCode } : undefined) as unknown as SupabaseClient,
    userId,
    email: `${userId}@example.com`,
  };
}

function row(userId: string, id: string, overrides: Record<string, unknown> = {}): MemoryLetter {
  return {
    id,
    user_id: userId,
    resume: "Chloe Chan kept a launch calendar for 1,200 teams.",
    job_description: "Keep the launch calendar.",
    company: "Lumen Ledger",
    role: "Operations Manager",
    hiring_manager: "",
    tone: "professional",
    length: "letter",
    language: "en",
    format: "both",
    provider: "grok",
    subject: "Application for Operations Manager",
    letter: "I would like to be considered.",
    email: "I am applying.",
    used_facts: ["Ran the calendar"],
    omissions: ["Kubernetes"],
    mode: "structured",
    notice: "結構草稿",
    updated_at: "2026-01-02T03:04:05.000Z",
    ...overrides,
  };
}

function draftInput(): DraftInput {
  return {
    resume: "Chloe Chan kept a launch calendar for 1,200 teams.",
    jobDescription: "Keep the launch calendar.",
    company: "Lumen Ledger",
    role: "Writer",
    hiringManager: "",
    tone: "direct",
    length: "email",
    language: "zh-Hant",
    format: "email",
    provider: "gemini",
  };
}

function draftOutput(): DraftOutput {
  return {
    mode: "structured",
    subject: "應徵",
    letter: "",
    email: "我應徵。",
    usedFacts: [],
    omissions: [],
    notice: "",
  };
}

function idFor(index: number): string {
  return `123e4567-e89b-42d3-a456-${index.toString(16).padStart(12, "0")}`;
}

async function errorText(response: Response): Promise<string> {
  const payload = (await response.json()) as { error?: string };
  return payload.error ?? "";
}

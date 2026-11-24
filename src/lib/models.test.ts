import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { DraftInput } from "./draft";
import { EMPTY_KEYS } from "./credentials";
import { fallbackNotice, ModelError, providerReady, providerStatus, writeWithModel } from "./models";
import { UnauthenticatedError } from "./session";
import { allowServiceUserForTests, setSupabaseTestDoubles } from "./supabase";

const FAKE_KEY = "unit-test-key";
const KEYS = ["XAI_API_KEY", "GEMINI_API_KEY"] as const;
const savedKeys = new Map<string, string | undefined>();
const originalFetch = globalThis.fetch;

describe("model helpers", { concurrency: 1 }, () => {
  beforeEach(() => {
    allowServiceUserForTests();
  });

  afterEach(() => {
    setSupabaseTestDoubles(null);
    for (const [key, value] of savedKeys) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    savedKeys.clear();
    globalThis.fetch = originalFetch;
  });

  it("treats a missing or blank key as unavailable", () => {
    rememberKeys();
    delete process.env.XAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    assert.deepEqual(providerStatus(), { grok: false, gemini: false });
    process.env.XAI_API_KEY = "   ";
    process.env.GEMINI_API_KEY = FAKE_KEY;
    assert.equal(providerReady("grok"), false);
    assert.equal(providerReady("gemini"), true);
    assert.equal(providerStatus({ grok: "user-owned-key", gemini: "" }).grok, true);
  });

  it("describes a missing key, a rejected key, and an unavailable model", () => {
    assert.match(fallbackNotice("grok", "missing"), /尚未連接 Grok/);
    assert.match(fallbackNotice("gemini", "missing"), /尚未連接 Gemini/);
    assert.match(fallbackNotice("grok", "unauthorized"), /XAI_API_KEY/);
    assert.match(fallbackNotice("gemini", "unauthorized"), /GEMINI_API_KEY/);
    assert.match(fallbackNotice("gemini", "unavailable"), /Gemini 這次沒有完成/);
    assert.match(fallbackNotice("grok", "bad_response"), /結構草稿/);
  });

  it("parses a fenced Grok reply and clears the email when only a letter was requested", async () => {
    rememberKeys();
    process.env.XAI_API_KEY = FAKE_KEY;
    const calls = stubFetch(
      chat({
        subject: "Hello",
        letter: "Letter body.",
        email: "Should be dropped.",
        usedFacts: [" fact ", ...Array.from({ length: 8 }, (_, index) => `extra ${index}`), ""],
        omissions: ["gap"],
      }),
    );
    const draft = await writeWithModel(input({ format: "letter" }));
    assert.equal(draft.mode, "model");
    assert.equal(draft.subject, "Hello");
    assert.equal(draft.letter, "Letter body.");
    assert.equal(draft.email, "");
    assert.equal(draft.usedFacts.length, 8);
    assert.equal(draft.usedFacts[0], "fact");
    assert.equal(calls.length, 1);
    assert.match(calls[0]?.url ?? "", /api\.x\.ai/);
    assert.equal(bearerMatches(calls[0]?.init), true);
    const body = JSON.parse(String(calls[0]?.init.body)) as { model?: string };
    assert.equal(body.model, "grok-4.7");
  });

  it("sends the saved Grok key and leaves the system key unused", async () => {
    rememberKeys();
    process.env.XAI_API_KEY = "system-key-unused";
    const calls = stubFetch(
      chat({
        subject: "Hello",
        letter: "Letter body.",
        email: "",
        usedFacts: ["fact"],
        omissions: [],
      }),
    );
    await writeWithModel(input({ format: "letter" }), { grok: "user-owned-key", gemini: "" });
    assert.equal(new Headers(calls[0]?.init.headers).get("authorization"), "Bearer user-owned-key");
    assert.equal(fallbackNotice("grok", "unauthorized", "user").includes("設定頁"), true);
  });

  it("reads Gemini text and skips thought parts", async () => {
    rememberKeys();
    process.env.GEMINI_API_KEY = FAKE_KEY;
    const calls = stubFetch({
      candidates: [
        {
          content: {
            parts: [
              { thought: true, text: "hidden reasoning" },
              {
                text: JSON.stringify({
                  subject: "主旨",
                  letter: "",
                  email: "電郵正文。",
                  usedFacts: [],
                  omissions: [],
                }),
              },
            ],
          },
        },
      ],
    });
    const draft = await writeWithModel(input({ provider: "gemini", format: "email" }));
    assert.equal(draft.letter, "");
    assert.equal(draft.email, "電郵正文。");
    assert.doesNotMatch(draft.email, /hidden reasoning/);
    assert.match(calls[0]?.url ?? "", /generativelanguage\.googleapis\.com/);
    assert.equal(geminiKeyMatches(calls[0]?.init), true);
    const sent = JSON.parse(String(calls[0]?.init.body)) as {
      systemInstruction?: { parts?: { text?: string }[] };
      contents?: { parts?: { text?: string; inlineData?: unknown }[] }[];
      generationConfig?: { temperature?: number; maxOutputTokens?: number; responseMimeType?: string };
    };
    assert.match(sent.systemInstruction?.parts?.[0]?.text ?? "", /^You write/);
    assert.equal(sent.generationConfig?.temperature, 0.4);
    assert.equal(sent.generationConfig?.maxOutputTokens, 4000);
    assert.equal(sent.generationConfig?.responseMimeType, "application/json");
    assert.equal(sent.contents?.[0]?.parts?.some((part) => part.inlineData != null), false);
    assert.equal(calls.length, 1);
  });

  it("retries a Gemini reply once when the first payload is not JSON", async () => {
    rememberKeys();
    process.env.GEMINI_API_KEY = FAKE_KEY;
    const calls = stubFetchSequence([
      geminiText("not json"),
      geminiText(
        JSON.stringify({
          subject: "主旨",
          letter: "",
          email: "電郵正文。",
          usedFacts: [],
          omissions: [],
        }),
      ),
    ]);
    const draft = await writeWithModel(input({ provider: "gemini", format: "email" }));
    assert.equal(draft.mode, "model");
    assert.equal(draft.email, "電郵正文。");
    assert.equal(calls.length, 2);
    const retry = JSON.parse(String(calls[1]?.init.body)) as {
      contents?: { parts?: { text?: string }[] }[];
    };
    assert.match(retry.contents?.[0]?.parts?.[0]?.text ?? "", /previous reply was unusable/);
  });

  it("retries a bad JSON payload once and then reports bad_response", async () => {
    rememberKeys();
    process.env.GEMINI_API_KEY = FAKE_KEY;
    const calls = stubFetch(geminiText("not json"));
    await assert.rejects(writeWithModel(input({ provider: "gemini", format: "email" })), (error: unknown) => {
      assert.ok(error instanceof ModelError);
      assert.equal(error.code, "bad_response");
      return true;
    });
    assert.equal(calls.length, 2);
  });

  it("does not retry an unauthorized response or a timeout", async () => {
    rememberKeys();
    process.env.GEMINI_API_KEY = FAKE_KEY;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response("no", { status: 401 });
    }) as typeof fetch;
    await assert.rejects(writeWithModel(input({ provider: "gemini" })), (error: unknown) => {
      assert.ok(error instanceof ModelError);
      assert.equal(error.code, "unauthorized");
      return true;
    });
    assert.equal(calls, 1);

    calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      throw new Error("offline");
    }) as typeof fetch;
    await assert.rejects(writeWithModel(input({ provider: "gemini" })), (error: unknown) => {
      assert.ok(error instanceof ModelError);
      assert.equal(error.code, "unavailable");
      return true;
    });
    assert.equal(calls, 1);
  });

  it("sends the current draft and the instruction when revising", async () => {
    rememberKeys();
    process.env.GEMINI_API_KEY = FAKE_KEY;
    const calls = stubFetch(
      geminiText(
        JSON.stringify({
          subject: "主旨",
          letter: "改短的信。",
          email: "",
          usedFacts: ["fact"],
          omissions: [],
        }),
      ),
    );
    const draft = await writeWithModel(input({ provider: "gemini", format: "letter" }), EMPTY_KEYS, {
      instruction: "把開頭寫短",
      subject: "舊主旨",
      letter: "這是現有的求職信。",
      email: "",
    });
    assert.equal(draft.letter, "改短的信。");
    assert.equal(draft.email, "");
    const sent = JSON.parse(String(calls[0]?.init.body)) as {
      systemInstruction?: { parts?: { text?: string }[] };
      contents?: { parts?: { text?: string }[] }[];
    };
    assert.match(sent.systemInstruction?.parts?.[0]?.text ?? "", /You revise/);
    const userText = sent.contents?.[0]?.parts?.[0]?.text ?? "";
    assert.match(userText, /這是現有的求職信/);
    assert.match(userText, /把開頭寫短/);
  });

  it("does not call the model when authentication fails", async () => {
    rememberKeys();
    setSupabaseTestDoubles(null);
    process.env.XAI_API_KEY = FAKE_KEY;
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      throw new Error("network");
    }) as typeof fetch;
    await assert.rejects(writeWithModel(input()), (error: unknown) => error instanceof UnauthenticatedError);
    assert.equal(called, false);
  });

  it("does not call the network when the key is missing", async () => {
    rememberKeys();
    delete process.env.XAI_API_KEY;
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      throw new Error("network");
    }) as typeof fetch;
    await assert.rejects(writeWithModel(input()), (error: unknown) => {
      assert.ok(error instanceof ModelError);
      assert.equal(error.code, "unauthorized");
      return true;
    });
    assert.equal(called, false);
  });

  it("maps an unauthorized response, a failed response, and a bad payload", async () => {
    rememberKeys();
    process.env.XAI_API_KEY = FAKE_KEY;
    globalThis.fetch = (async () => new Response("no", { status: 401 })) as typeof fetch;
    await assert.rejects(writeWithModel(input()), (error: unknown) => {
      assert.ok(error instanceof ModelError);
      assert.equal(error.code, "unauthorized");
      return true;
    });

    globalThis.fetch = (async () => new Response("no", { status: 503 })) as typeof fetch;
    await assert.rejects(writeWithModel(input()), (error: unknown) => {
      assert.ok(error instanceof ModelError);
      assert.equal(error.code, "unavailable");
      return true;
    });

    globalThis.fetch = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    await assert.rejects(writeWithModel(input()), (error: unknown) => {
      assert.ok(error instanceof ModelError);
      assert.equal(error.code, "unavailable");
      return true;
    });

    const calls = stubFetch({ choices: [{ message: { content: "not json" } }] });
    await assert.rejects(writeWithModel(input()), (error: unknown) => {
      assert.ok(error instanceof ModelError);
      assert.equal(error.code, "bad_response");
      return true;
    });
    assert.equal(calls.length, 2);
  });
});

function rememberKeys(): void {
  for (const key of KEYS) {
    if (!savedKeys.has(key)) savedKeys.set(key, process.env[key]);
  }
}

function input(overrides: Partial<DraftInput> = {}): DraftInput {
  return {
    resume: "Chloe Chan\nRan the quarterly launch calendar for a product used by 1,200 teams.",
    jobDescription: "Own the launch calendar and write the weekly operating review for the founders.",
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

function chat(payload: unknown): unknown {
  return { choices: [{ message: { content: "```json\n" + JSON.stringify(payload) + "\n```" } }] };
}

function geminiText(text: string): unknown {
  return { candidates: [{ content: { parts: [{ text }] } }] };
}

function stubFetchSequence(payloads: unknown[]): { url: string; init: RequestInit }[] {
  const calls: { url: string; init: RequestInit }[] = [];
  let index = 0;
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const payload = payloads[index] ?? payloads[payloads.length - 1];
    index += 1;
    return Response.json(payload);
  }) as typeof fetch;
  return calls;
}

function stubFetch(payload: unknown): { url: string; init: RequestInit }[] {
  const calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return Response.json(payload);
  }) as typeof fetch;
  return calls;
}

function bearerMatches(init: RequestInit | undefined): boolean {
  return new Headers(init?.headers).get("authorization") === `Bearer ${FAKE_KEY}`;
}

function geminiKeyMatches(init: RequestInit | undefined): boolean {
  return new Headers(init?.headers).get("x-goog-api-key") === FAKE_KEY;
}

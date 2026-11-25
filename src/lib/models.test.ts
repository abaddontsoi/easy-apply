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

  it("rewrites an oversized résumé before the letter prompt", async () => {
    rememberKeys();
    process.env.XAI_API_KEY = FAKE_KEY;
    const padding = "歷".repeat(8_001);
    const calls = stubRoute((system) => {
      if (system.startsWith("You compress")) {
        return { choices: [{ message: { content: "Chloe Chan\nRan the launch calendar for 1,200 teams." } }] };
      }
      return chat({
        subject: "Hello",
        letter: "Letter body.",
        email: "Email body.",
        usedFacts: ["1,200 teams"],
        omissions: [],
      });
    });
    const draft = await writeWithModel(input({ resume: `Chloe Chan\n${padding}` }));
    assert.equal(draft.letter, "Letter body.");
    const rewrites = calls.filter((call) => systemText(call).startsWith("You compress"));
    const letters = calls.filter((call) => systemText(call).startsWith("You write"));
    assert.equal(rewrites.length, 2);
    assert.equal(letters.length, 1);
    assert.match(userText(rewrites[0]), /Compress this résumé/);
    assert.equal(userText(rewrites[0]).includes(padding.slice(0, 20)), true);
    const letterPrompt = userText(letters[0]);
    assert.match(letterPrompt, /1,200 teams/);
    assert.equal(letterPrompt.includes(padding.slice(0, 500)), false);
    const sent = JSON.parse(String(rewrites[0]?.init.body)) as { temperature?: number; max_tokens?: number };
    assert.equal(sent.temperature, 0.2);
    assert.ok((sent.max_tokens ?? 0) < 4_000);
  });

  it("asks Gemini for plain text when the job description exceeds the input budget", async () => {
    rememberKeys();
    process.env.GEMINI_API_KEY = FAKE_KEY;
    const job = `職責說明。${"需".repeat(4_001)}`;
    const calls = stubRoute((system) => {
      if (system.startsWith("You compress")) return geminiText("Operations Manager\nOwn the launch calendar.");
      return geminiText(
        JSON.stringify({
          subject: "主旨",
          letter: "信。",
          email: "",
          usedFacts: [],
          omissions: [],
        }),
      );
    });
    const draft = await writeWithModel(input({ provider: "gemini", format: "letter", jobDescription: job }));
    assert.equal(draft.letter, "信。");
    const rewrite = calls.find((call) => systemText(call).startsWith("You compress"));
    const letter = calls.find((call) => systemText(call).startsWith("You write"));
    assert.ok(rewrite);
    assert.ok(letter);
    const rewriteBody = JSON.parse(String(rewrite?.init.body)) as {
      generationConfig?: { temperature?: number; maxOutputTokens?: number; responseMimeType?: string };
    };
    assert.equal(rewriteBody.generationConfig?.temperature, 0.2);
    assert.equal(rewriteBody.generationConfig?.responseMimeType, undefined);
    assert.ok((rewriteBody.generationConfig?.maxOutputTokens ?? 0) < 4_000);
    assert.match(userText(letter), /Own the launch calendar/);
    assert.equal(userText(letter).includes(job), false);
  });

  it("uses a clipped excerpt when the rewrite is empty and still writes the letter", async () => {
    rememberKeys();
    process.env.XAI_API_KEY = FAKE_KEY;
    const resume = `Chloe Chan\nKept metric 1,200 teams.\n${"經歷".repeat(5_000)}`;
    const calls = stubRoute((system) => {
      if (system.startsWith("You compress")) return { choices: [{ message: { content: "   " } }] };
      return chat({
        subject: "Hello",
        letter: "Letter body.",
        email: "",
        usedFacts: ["1,200 teams"],
        omissions: [],
      });
    });
    const draft = await writeWithModel(input({ format: "letter", resume }));
    assert.equal(draft.letter, "Letter body.");
    const letter = calls.find((call) => systemText(call).startsWith("You write"));
    const résumé = quoted(userText(letter), "Résumé");
    assert.match(résumé, /Chloe Chan/);
    assert.match(résumé, /1,200/);
    assert.ok(résumé.length <= 6_000);
  });

  it("does not call the letter model when rewriting is unauthorized", async () => {
    rememberKeys();
    process.env.XAI_API_KEY = FAKE_KEY;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response("no", { status: 401 });
    }) as typeof fetch;
    await assert.rejects(
      writeWithModel(input({ resume: `Chloe Chan\n${"歷".repeat(8_001)}` })),
      (error: unknown) => error instanceof ModelError && error.code === "unauthorized",
    );
    assert.equal(calls, 2);
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

function stubRoute(reply: (system: string) => unknown): { url: string; init: RequestInit }[] {
  const calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(url), init: init ?? {} };
    calls.push(call);
    return Response.json(reply(systemText(call)));
  }) as typeof fetch;
  return calls;
}

function systemText(call: { init: RequestInit } | undefined): string {
  if (!call) return "";
  const body = JSON.parse(String(call.init.body)) as {
    messages?: { content?: string }[];
    systemInstruction?: { parts?: { text?: string }[] };
  };
  return body.messages?.[0]?.content ?? body.systemInstruction?.parts?.[0]?.text ?? "";
}

function userText(call: { init: RequestInit } | undefined): string {
  if (!call) return "";
  const body = JSON.parse(String(call.init.body)) as {
    messages?: { content?: string }[];
    contents?: { parts?: { text?: string }[] }[];
  };
  return body.messages?.[1]?.content ?? body.contents?.[0]?.parts?.[0]?.text ?? "";
}

function quoted(text: string, label: string): string {
  const marker = `${label}:\n"""\n`;
  const start = text.indexOf(marker);
  if (start < 0) return "";
  const from = start + marker.length;
  const end = text.indexOf('\n"""', from);
  return end < 0 ? text.slice(from) : text.slice(from, end);
}

function bearerMatches(init: RequestInit | undefined): boolean {
  return new Headers(init?.headers).get("authorization") === `Bearer ${FAKE_KEY}`;
}

function geminiKeyMatches(init: RequestInit | undefined): boolean {
  return new Headers(init?.headers).get("x-goog-api-key") === FAKE_KEY;
}

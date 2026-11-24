import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { POST as draft } from "../../src/app/api/draft/route";
import { USER_A, installDesk, jsonRequest, letterBody, readPayload, configureTestEnv, installTestEnv } from "./harness";

const FAKE_KEY = "unit-test-key";

installTestEnv();

describe("draft route", { concurrency: 1 }, () => {
  it("rejects an unconfigured project and a signed-out writer", async () => {
    const missing = await draft(jsonRequest("http://127.0.0.1/api/draft", letterBody()));
    assert.equal(missing.status, 503);

    configureTestEnv();
    const desk = installDesk([USER_A]);
    desk.signInAs(null);
    const signedOut = await draft(jsonRequest("http://127.0.0.1/api/draft", letterBody()));
    assert.equal(signedOut.status, 401);
  });

  it("stores a structured draft without calling a model when no key is set", async () => {
    configureTestEnv();
    const desk = installDesk([USER_A]);
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      throw new Error("network");
    }) as typeof fetch;

    const response = await draft(jsonRequest("http://127.0.0.1/api/draft", letterBody({ letterId: "not-a-uuid" })));
    assert.equal(response.status, 400);
    assert.equal(called, false);
    assert.equal(desk.rows.length, 0);

    const written = await draft(jsonRequest("http://127.0.0.1/api/draft", letterBody()));
    assert.equal(written.status, 200);
    const body = await readPayload(written);
    assert.equal(body.mode, "structured");
    assert.equal(body.stored, true);
    assert.match(String(body.notice), /尚未連接 Grok/);
    assert.match(String(body.letter), /1,200 teams/);
    assert.doesNotMatch(String(body.letter), /kubernetes/i);
    assert.equal(called, false);
    assert.equal(desk.rows.length, 1);
    assert.equal(desk.rows[0]?.user_id, USER_A.id);
    assert.match(String(desk.rows[0]?.letter), /1,200 teams/);
  });

  it("keeps the structured draft when the model rejects the key", async () => {
    configureTestEnv();
    process.env.XAI_API_KEY = FAKE_KEY;
    const desk = installDesk([USER_A]);
    const calls: string[] = [];
    globalThis.fetch = (async (url: RequestInfo | URL) => {
      calls.push(String(url));
      return new Response("no", { status: 401 });
    }) as typeof fetch;

    const response = await draft(jsonRequest("http://127.0.0.1/api/draft", letterBody()));
    assert.equal(response.status, 200);
    const body = await readPayload(response);
    assert.equal(body.mode, "structured");
    assert.equal(body.stored, true);
    assert.match(String(body.notice), /沒有接受這把金鑰/);
    assert.match(String(body.letter), /Chloe Chan/);
    assert.equal(calls.length, 1);
    assert.match(calls[0] ?? "", /api\.x\.ai/);
    assert.equal(desk.rows[0]?.user_id, USER_A.id);
  });

  it("stops the ninth write inside ten minutes", async () => {
    configureTestEnv();
    const desk = installDesk([USER_A]);
    for (let count = 0; count < 8; count += 1) {
      const response = await draft(jsonRequest("http://127.0.0.1/api/draft", letterBody({ role: `Role ${count}` })));
      assert.equal(response.status, 200);
    }
    const blocked = await draft(jsonRequest("http://127.0.0.1/api/draft", letterBody()));
    assert.equal(blocked.status, 429);
    assert.match(String((await readPayload(blocked)).error), /八次/);
    assert.equal(desk.rows.length, 8);
    assert.ok(desk.rows.every((row) => row.user_id === USER_A.id));
  });

  it("keeps the submitted letter when a revise call fails", async () => {
    configureTestEnv();
    process.env.XAI_API_KEY = FAKE_KEY;
    const desk = installDesk([USER_A]);
    globalThis.fetch = (async () => new Response("no", { status: 503 })) as typeof fetch;
    const kept = "Please keep this exact sentence about the launch calendar.";

    const response = await draft(
      jsonRequest(
        "http://127.0.0.1/api/draft",
        letterBody({
          instruction: "把開頭寫短",
          mode: "model",
          letter: kept,
          subject: "Kept subject",
        }),
      ),
    );
    assert.equal(response.status, 200);
    const body = await readPayload(response);
    assert.equal(body.mode, "model");
    assert.equal(body.letter, kept);
    assert.equal(body.subject, "Kept subject");
    assert.equal(body.stored, true);
    assert.match(String(body.notice), /這次沒有完成/);
    assert.doesNotMatch(String(body.letter), /From the résumé/);
    assert.equal(desk.rows.length, 1);
    assert.equal(desk.rows[0]?.letter, kept);
    assert.equal(desk.rows[0]?.mode, "model");
  });

  it("rejects an instruction longer than 300 characters before storing a letter", async () => {
    configureTestEnv();
    const desk = installDesk([USER_A]);
    const response = await draft(
      jsonRequest("http://127.0.0.1/api/draft", letterBody({ instruction: "改".repeat(301) })),
    );
    assert.equal(response.status, 400);
    assert.match(String((await readPayload(response)).error), /300/);
    assert.equal(desk.rows.length, 0);
  });
});

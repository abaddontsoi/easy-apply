import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { privateJson, readJson } from "./http";

describe("privateJson", () => {
  it("returns private JSON and the requested status", async () => {
    const response = privateJson({ ok: true }, 201);
    assert.equal(response.status, 201);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(privateJson({ ok: true }).status, 200);
  });
});

describe("readJson", () => {
  it("parses a JSON body", async () => {
    const parsed = await readJson(jsonRequest('{"resume":"hello"}'), 100);
    assert.equal(parsed.ok, true);
    if (parsed.ok) assert.deepEqual(parsed.value, { resume: "hello" });
  });

  it("rejects a body over the limit and a body that is not JSON", async () => {
    const tooLong = await readJson(jsonRequest("x".repeat(11)), 10);
    assert.equal(tooLong.ok, false);
    if (!tooLong.ok) {
      assert.equal(tooLong.response.status, 413);
      assert.match(await textError(tooLong.response), /太長/);
    }

    const broken = await readJson(jsonRequest("not-json"), 100);
    assert.equal(broken.ok, false);
    if (!broken.ok) {
      assert.equal(broken.response.status, 400);
      assert.match(await textError(broken.response), /完整/);
    }
  });
});

function jsonRequest(body: string): Request {
  return new Request("http://127.0.0.1/api/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

async function textError(response: Response): Promise<string> {
  const payload = (await response.json()) as { error?: string };
  return payload.error ?? "";
}

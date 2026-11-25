import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { POST as draft } from "../../src/app/api/draft/route";
import { GET as readSettings, POST as saveSettings } from "../../src/app/api/settings/route";
import {
  USER_A,
  USER_B,
  configureTestEnv,
  installDesk,
  installTestEnv,
  jsonRequest,
  letterBody,
  readPayload,
} from "./harness";

const USER_KEY = "grok-user-key-1234";
const SYSTEM_KEY = "system-key-should-stay";

installTestEnv();

describe("settings", { concurrency: 1 }, () => {
  it("stores a masked personal key and uses it instead of the system key", async () => {
    configureTestEnv();
    process.env.XAI_API_KEY = SYSTEM_KEY;
    const desk = installDesk([USER_A, USER_B]);

    const saved = await saveSettings(jsonRequest("http://127.0.0.1/api/settings", { grok: USER_KEY }));
    assert.equal(saved.status, 200);
    const savedBody = await readPayload(saved);
    assert.equal(JSON.stringify(savedBody).includes(USER_KEY), false);
    assert.equal(JSON.stringify(savedBody).includes(SYSTEM_KEY), false);
    const grok = savedBody.grok as { source?: string; mask?: string };
    assert.equal(grok.source, "user");
    assert.equal(grok.mask, "••••1234");

    desk.signInAs(USER_B.id);
    const other = await readSettings();
    assert.equal(other.status, 200);
    const otherBody = await readPayload(other);
    assert.equal((otherBody.grok as { source?: string }).source, "system");
    assert.equal(JSON.stringify(otherBody).includes(USER_KEY), false);

    desk.signInAs(USER_A.id);
    const calls: string[] = [];
    globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      calls.push(new Headers(init?.headers).get("authorization") ?? "");
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                subject: "Hello",
                letter: "Letter from the saved key.",
                email: "Email from the saved key.",
                usedFacts: ["fact"],
                omissions: [],
              }),
            },
          },
        ],
      });
    }) as typeof fetch;
    const written = await draft(jsonRequest("http://127.0.0.1/api/draft", letterBody()));
    assert.equal(written.status, 200);
    const writtenBody = await readPayload(written);
    assert.equal(writtenBody.mode, "model");
    assert.deepEqual(calls, [`Bearer ${USER_KEY}`]);

    const cleared = await saveSettings(jsonRequest("http://127.0.0.1/api/settings", { grok: "" }));
    assert.equal(cleared.status, 200);
    const clearedBody = await readPayload(cleared);
    assert.equal((clearedBody.grok as { source?: string }).source, "system");
    assert.equal(JSON.stringify(clearedBody).includes(SYSTEM_KEY), false);
  });

  it("rejects a signed-out save and a key that contains spaces", async () => {
    configureTestEnv();
    const desk = installDesk([USER_A]);
    desk.signInAs(null);
    const signedOut = await readSettings();
    assert.equal(signedOut.status, 401);

    desk.signInAs(USER_A.id);
    const broken = await saveSettings(jsonRequest("http://127.0.0.1/api/settings", { grok: "not a token" }));
    assert.equal(broken.status, 400);
    assert.equal(desk.secrets.length, 0);
  });
});

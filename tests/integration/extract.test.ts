import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { POST as extract } from "../../src/app/api/extract/route";
import { USER_A, installDesk, useConfiguredEnv, useTestEnv, readPayload } from "./harness";

useTestEnv();

describe("extract route", { concurrency: 1 }, () => {
  it("rejects an unconfigured project and a signed-out upload", async () => {
    const missing = await extract(fileRequest("resume.txt", "Chloe Chan résumé text that is long enough."));
    assert.equal(missing.status, 503);

    useConfiguredEnv();
    const desk = installDesk([USER_A]);
    desk.signInAs(null);
    const signedOut = await extract(fileRequest("resume.txt", "Chloe Chan résumé text that is long enough."));
    assert.equal(signedOut.status, 401);
  });

  it("reads a text résumé and rejects a request without a file", async () => {
    useConfiguredEnv();
    installDesk([USER_A]);
    const response = await extract(fileRequest("C:\\docs\\resume.txt", "Chloe Chan\nKept the launch calendar for 1,200 teams."));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const body = await readPayload(response);
    assert.match(String(body.text), /1,200 teams/);
    assert.equal(body.truncated, false);

    const empty = await extract(
      new Request("http://127.0.0.1/api/extract", { method: "POST", body: new FormData() }),
    );
    assert.equal(empty.status, 400);

    const broken = await extract(
      new Request("http://127.0.0.1/api/extract", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "hello",
      }),
    );
    assert.equal(broken.status, 400);
  });
});

function fileRequest(filename: string, text: string): Request {
  const form = new FormData();
  form.set("file", new File([text], filename, { type: "text/plain" }));
  return new Request("http://127.0.0.1/api/extract", { method: "POST", body: form });
}

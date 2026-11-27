import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { POST as draft } from "../../src/app/api/draft/route";
import { DELETE, GET, POST } from "../../src/app/api/keywords/route";
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

installTestEnv();

describe("keyword records", { concurrency: 1 }, () => {
  it("stores a keyword for the signed-in person and counts it after a letter", async () => {
    configureTestEnv();
    const desk = installDesk([USER_A, USER_B]);
    desk.signInAs(null);
    const signedOut = await POST(jsonRequest("http://127.0.0.1/api/keywords", { text: "Kubernetes" }));
    assert.equal(signedOut.status, 401);
    desk.signInAs(USER_A.id);
    const added = await POST(jsonRequest("http://127.0.0.1/api/keywords", { text: "  Kubernetes " }));
    assert.equal(added.status, 200);
    const created = await readPayload(added);
    assert.equal((created.keyword as { text: string }).text, "Kubernetes");
    assert.equal((created.keyword as { hits: number }).hits, 0);

    const again = await POST(jsonRequest("http://127.0.0.1/api/keywords", { text: "kubernetes" }));
    assert.equal(again.status, 200);
    assert.equal(desk.keywords.length, 1);

    const written = await draft(jsonRequest("http://127.0.0.1/api/draft", letterBody()));
    assert.equal(written.status, 200);
    assert.equal(desk.keywords[0]?.hits, 1);

    const listed = await GET();
    assert.equal(listed.status, 200);
    const body = await readPayload(listed);
    assert.equal((body.keywords as { hits: number }[])[0]?.hits, 1);

    desk.signInAs(USER_B.id);
    const other = await GET();
    const otherBody = await readPayload(other);
    assert.deepEqual(otherBody.keywords, []);

    desk.signInAs(USER_A.id);
    const removed = await DELETE(jsonRequest("http://127.0.0.1/api/keywords", { text: "Kubernetes" }, "DELETE"));
    assert.equal(removed.status, 200);
    assert.equal(desk.keywords.length, 0);
  });
});

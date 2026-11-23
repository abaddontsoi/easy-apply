import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GET as readLetter, PATCH as updateLetter, DELETE as deleteLetter } from "../../src/app/api/letters/[id]/route";
import { GET as listLetters, POST as createLetter } from "../../src/app/api/letters/route";
import {
  TEST_URL,
  USER_A,
  USER_B,
  installDesk,
  jsonRequest,
  letterBody,
  readPayload,
  useConfiguredEnv,
  useTestEnv,
} from "./harness";

useTestEnv();

describe("letter routes", { concurrency: 1 }, () => {
  it("rejects an unconfigured project and a legacy JWT key", async () => {
    const missing = await listLetters();
    assert.equal(missing.status, 503);
    assert.match(String((await readPayload(missing)).error), /尚未設定/);

    process.env.SUPABASE_URL = TEST_URL;
    process.env.SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiJ9.legacy.sig";
    process.env.SUPABASE_SECRET_KEY = "eyJhbGciOiJIUzI1NiJ9.legacy.sig";
    const legacy = await listLetters();
    assert.equal(legacy.status, 503);
  });

  it("rejects a signed-out reader", async () => {
    useConfiguredEnv();
    const desk = installDesk([USER_A, USER_B]);
    desk.signInAs(null);
    const response = await listLetters();
    assert.equal(response.status, 401);
    assert.match(String((await readPayload(response)).error), /請先登入/);
  });

  it("keeps list, read, update, and delete inside the signed-in user", async () => {
    useConfiguredEnv();
    const desk = installDesk([USER_A, USER_B]);
    desk.signInAs(USER_A.id);
    const created = await createLetter(jsonRequest("http://127.0.0.1/api/letters", letterBody()));
    assert.equal(created.status, 200);
    assert.equal(created.headers.get("cache-control"), "private, no-store");
    const id = String((await readPayload(created)).id);
    assert.match(id, /^[0-9a-f-]{36}$/i);
    assert.equal(desk.rows.filter((row) => row.user_id === USER_A.id).length, 1);
    assert.equal(desk.rows.filter((row) => row.user_id === USER_B.id).length, 0);

    desk.signInAs(USER_B.id);
    const hiddenList = await listLetters();
    assert.equal(hiddenList.status, 200);
    assert.deepEqual((await readPayload(hiddenList)).letters, []);

    const hiddenRead = await readLetter(requestFor(id), contextFor(id));
    assert.equal(hiddenRead.status, 404);
    const hiddenUpdate = await updateLetter(
      jsonRequest(`http://127.0.0.1/api/letters/${id}`, letterBody({ role: "Intruder" }), "PATCH"),
      contextFor(id),
    );
    assert.equal(hiddenUpdate.status, 404);
    const hiddenDelete = await deleteLetter(requestFor(id), contextFor(id));
    assert.equal(hiddenDelete.status, 404);
    assert.equal(desk.rows.filter((row) => row.user_id === USER_A.id).length, 1);
    assert.equal(desk.rows.find((row) => row.id === id)?.role, "Operations Manager");

    desk.signInAs(USER_A.id);
    const visible = await readLetter(requestFor(id), contextFor(id));
    assert.equal(visible.status, 200);
    const visibleBody = await readPayload(visible);
    const letter = visibleBody.letter as { resume?: string; role?: string };
    assert.match(letter.resume ?? "", /Chloe Chan/);
    assert.equal(letter.role, "Operations Manager");

    const updated = await updateLetter(
      jsonRequest(`http://127.0.0.1/api/letters/${id}`, letterBody({ role: "Editor" }), "PATCH"),
      contextFor(id),
    );
    assert.equal(updated.status, 200);
    assert.equal(desk.rows.find((row) => row.id === id)?.role, "Editor");
    assert.equal(desk.rows.find((row) => row.id === id)?.user_id, USER_A.id);

    const removed = await deleteLetter(requestFor(id), contextFor(id));
    assert.equal(removed.status, 200);
    const gone = await readLetter(requestFor(id), contextFor(id));
    assert.equal(gone.status, 404);
  });

  it("rejects an invalid id and a letter that is too short", async () => {
    useConfiguredEnv();
    installDesk([USER_A]);
    const invalid = await readLetter(requestFor("not-a-uuid"), contextFor("not-a-uuid"));
    assert.equal(invalid.status, 400);

    const broken = await createLetter(
      new Request("http://127.0.0.1/api/letters", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
    );
    assert.equal(broken.status, 400);

    const short = await createLetter(jsonRequest("http://127.0.0.1/api/letters", letterBody({ resume: "Too short" })));
    assert.equal(short.status, 400);
  });

  it("counts only the signed-in user's letters toward the 100 letter limit", async () => {
    useConfiguredEnv();
    const desk = installDesk([USER_A, USER_B]);
    for (let index = 0; index < 100; index += 1) {
      desk.rows.push({ id: crypto.randomUUID(), user_id: USER_A.id });
    }
    desk.signInAs(USER_A.id);
    const blocked = await createLetter(jsonRequest("http://127.0.0.1/api/letters", letterBody()));
    assert.equal(blocked.status, 409);
    assert.equal(desk.rows.filter((row) => row.user_id === USER_A.id).length, 100);

    desk.signInAs(USER_B.id);
    const saved = await createLetter(jsonRequest("http://127.0.0.1/api/letters", letterBody({ role: "Other" })));
    assert.equal(saved.status, 200);
    assert.equal(desk.rows.filter((row) => row.user_id === USER_B.id).length, 1);
  });
});

function requestFor(id: string): Request {
  return new Request(`http://127.0.0.1/api/letters/${id}`);
}

function contextFor(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

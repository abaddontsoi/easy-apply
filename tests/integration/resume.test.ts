import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { POST as extract } from "../../src/app/api/extract/route";
import { GET as downloadResume } from "../../src/app/api/resume/file/route";
import { DELETE as deleteResume, GET as readResume, PUT as saveResume } from "../../src/app/api/resume/route";
import { USER_A, USER_B, configureTestEnv, installDesk, installTestEnv, jsonRequest, readPayload } from "./harness";

installTestEnv();

describe("resume storage", { concurrency: 1 }, () => {
  it("keeps the original file and the extracted text for the signed-in user", async () => {
    configureTestEnv();
    const desk = installDesk([USER_A, USER_B]);
    const raw = "Chloe Chan\nOriginal résumé file for persistent storage.";
    const encoded = Buffer.from(raw).toString("base64");

    const uploaded = await extract(fileRequest("C:\\docs\\履歷.txt", raw));
    assert.equal(uploaded.status, 200);
    const uploadedBody = await readPayload(uploaded);
    assert.match(String(uploadedBody.text), /Original résumé file/);
    assert.equal(uploadedBody.hasFile, true);
    assert.equal(uploadedBody.filename, "履歷.txt");
    assert.equal(JSON.stringify(uploadedBody).includes(encoded), false);
    assert.equal(JSON.stringify(uploadedBody).includes("file_base64"), false);

    const stored = await readResume();
    assert.equal(stored.status, 200);
    const storedBody = await readPayload(stored);
    const resume = storedBody.resume as { text?: string; hasFile?: boolean; filename?: string };
    assert.equal(resume.hasFile, true);
    assert.equal(resume.filename, "履歷.txt");
    assert.match(String(resume.text), /Original résumé file/);
    assert.equal(JSON.stringify(storedBody).includes(encoded), false);

    const file = await downloadResume();
    assert.equal(file.status, 200);
    assert.match(file.headers.get("content-disposition") ?? "", /filename\*=UTF-8''/);
    assert.equal(file.headers.get("cache-control"), "private, no-store");
    assert.equal(Buffer.from(await file.arrayBuffer()).toString("utf8"), raw);

    desk.signInAs(USER_B.id);
    const other = await readPayload(await readResume());
    assert.equal(other.resume, null);
    const otherFile = await downloadResume();
    assert.equal(otherFile.status, 404);

    desk.signInAs(USER_A.id);
    const edited = await saveResume(
      jsonRequest("http://127.0.0.1/api/resume", { text: "Edited résumé text that stays with the file." }, "PUT"),
    );
    assert.equal(edited.status, 200);
    const editedBody = await readPayload(edited);
    const editedResume = editedBody.resume as { text?: string; hasFile?: boolean };
    assert.equal(editedResume.text, "Edited résumé text that stays with the file.");
    assert.equal(editedResume.hasFile, true);
    assert.equal(JSON.stringify(editedBody).includes(encoded), false);
    assert.equal(Buffer.from(await (await downloadResume()).arrayBuffer()).toString("utf8"), raw);

    const cleared = await deleteResume();
    assert.equal(cleared.status, 200);
    assert.equal((await readPayload(await readResume())).resume, null);
    assert.equal((await downloadResume()).status, 404);
  });

  it("replaces the stored file when the text is saved on its own", async () => {
    configureTestEnv();
    const desk = installDesk([USER_A]);
    await extract(fileRequest("resume.txt", "File backed résumé text that is long enough."));
    const pasted = await saveResume(
      jsonRequest("http://127.0.0.1/api/resume", { text: "Pasted résumé text with the file removed.", clearFile: true }, "PUT"),
    );
    assert.equal(pasted.status, 200);
    const body = await readPayload(pasted);
    const resume = body.resume as { text?: string; hasFile?: boolean };
    assert.equal(resume.text, "Pasted résumé text with the file removed.");
    assert.equal(resume.hasFile, false);
    assert.equal((await downloadResume()).status, 404);

    desk.signInAs(null);
    assert.equal((await readResume()).status, 401);
    assert.equal((await saveResume(jsonRequest("http://127.0.0.1/api/resume", { text: "nope" }, "PUT"))).status, 401);
    assert.equal((await deleteResume()).status, 401);
  });
});

function fileRequest(filename: string, text: string): Request {
  const form = new FormData();
  form.set("file", new File([text], filename, { type: "text/plain" }));
  return new Request("http://127.0.0.1/api/extract", { method: "POST", body: form });
}

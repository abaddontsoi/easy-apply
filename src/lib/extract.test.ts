import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ExtractError, extractDocument } from "./extract";

describe("extractDocument", () => {
  it("reads a text file, including a Windows path, and strips null bytes", async () => {
    const bytes = new TextEncoder().encode("  line one\u0000\r\nline two  ");
    const extracted = await extractDocument("C:\\docs\\Resume.TXT", bytes);
    assert.equal(extracted.truncated, false);
    assert.equal(extracted.text, "line one\nline two");
    const markdown = await extractDocument("notes/resume.md", new TextEncoder().encode("hello from markdown file"));
    assert.equal(markdown.text, "hello from markdown file");
  });

  it("truncates text past 20,000 characters", async () => {
    const extracted = await extractDocument("long.txt", new TextEncoder().encode("字".repeat(20_001)));
    assert.equal(extracted.truncated, true);
    assert.equal(extracted.text.length, 20_000);
  });

  it("rejects an empty file, a file over 4MB, and an unsupported extension", async () => {
    await assert.rejects(extractDocument("empty.txt", new Uint8Array()), (error: unknown) => {
      assert.ok(error instanceof ExtractError);
      assert.equal(error.status, 422);
      return true;
    });
    await assert.rejects(extractDocument("big.txt", new Uint8Array(4 * 1024 * 1024 + 1)), (error: unknown) => {
      assert.ok(error instanceof ExtractError);
      assert.equal(error.status, 413);
      return true;
    });
    await assert.rejects(extractDocument("resume.doc", new TextEncoder().encode("hello")), (error: unknown) => {
      assert.ok(error instanceof ExtractError);
      assert.equal(error.status, 415);
      return true;
    });
    await assert.rejects(extractDocument("blank.txt", new TextEncoder().encode(" \n\t ")), (error: unknown) => {
      assert.ok(error instanceof ExtractError);
      assert.equal(error.status, 422);
      return true;
    });
  });

  it("rejects a PDF that does not start with the PDF marker", async () => {
    await assert.rejects(extractDocument("scan.pdf", new TextEncoder().encode("%PDF")), (error: unknown) => {
      assert.ok(error instanceof ExtractError);
      assert.equal(error.status, 422);
      assert.match(error.message, /不是可讀的 PDF/);
      return true;
    });
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseSelectedJob } from "./selected-job";

describe("parseSelectedJob", () => {
  it("keeps a selected listing and drops a blank one", () => {
    const parsed = parseSelectedJob(
      JSON.stringify({ company: "Lumen Ledger", role: "Operations Manager", text: "Own the launch calendar." }),
    );
    assert.deepEqual(parsed, {
      company: "Lumen Ledger",
      role: "Operations Manager",
      text: "Own the launch calendar.",
    });
    assert.equal(parseSelectedJob(JSON.stringify({ company: "", role: "", text: "   " })), null);
    assert.equal(parseSelectedJob("not-json"), null);
    assert.equal(parseSelectedJob(null), null);
  });
});

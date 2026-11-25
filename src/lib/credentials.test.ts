import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  describeKeys,
  maskSecret,
  parseKeyPatch,
  resolveModelKey,
  resolveOwnedSecret,
} from "./credentials";

const KEYS = ["XAI_API_KEY", "GEMINI_API_KEY"] as const;
const saved = new Map<string, string | undefined>();

describe("credentials", () => {
  afterEach(() => {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    saved.clear();
  });

  it("masks only the last four characters", () => {
    assert.equal(maskSecret("grok-user-key-1234"), "••••1234");
    assert.equal(maskSecret("   "), "");
  });

  it("accepts a new key, a cleared key, and rejects a broken key", () => {
    const savedKey = parseKeyPatch({ grok: "  grok-user-key-1234  ", gemini: "" });
    assert.equal(savedKey.ok, true);
    if (!savedKey.ok) return;
    assert.deepEqual(savedKey.patch, { grok: "grok-user-key-1234", gemini: "" });

    const cleared = parseKeyPatch({ gemini: null });
    assert.equal(cleared.ok, true);
    if (!cleared.ok) return;
    assert.deepEqual(cleared.patch, { gemini: "" });

    assert.equal(parseKeyPatch({}).ok, false);
    assert.equal(parseKeyPatch({ grok: "short" }).ok, false);
    assert.equal(parseKeyPatch({ grok: "has a space inside" }).ok, false);
    assert.equal(parseKeyPatch({ gemini: 12 }).ok, false);
  });

  it("uses a saved key and does not fall back to the system key", () => {
    remember();
    process.env.XAI_API_KEY = "system-grok-key";
    process.env.GEMINI_API_KEY = "system-gemini-key";
    assert.deepEqual(resolveModelKey("grok", { grok: "user-grok-key", gemini: "" }), {
      value: "user-grok-key",
      source: "user",
    });
    assert.deepEqual(resolveModelKey("gemini", { grok: "user-grok-key", gemini: "" }), {
      value: "system-gemini-key",
      source: "system",
    });
    assert.deepEqual(resolveOwnedSecret("", undefined), { value: "", source: "none" });
    assert.deepEqual(resolveOwnedSecret("bad token", "system-gemini-key"), { value: "", source: "user" });
  });

  it("describes a saved key with a mask and hides the system key", () => {
    remember();
    process.env.XAI_API_KEY = "system-grok-key";
    delete process.env.GEMINI_API_KEY;
    const view = describeKeys({ grok: "grok-user-key-1234", gemini: "" });
    assert.deepEqual(view.grok, { source: "user", mask: "••••1234" });
    assert.deepEqual(view.gemini, { source: "none", mask: "" });
    assert.equal(JSON.stringify(view).includes("system-grok-key"), false);
    assert.equal(JSON.stringify(view).includes("grok-user-key-1234"), false);
  });
});

function remember(): void {
  for (const key of KEYS) {
    if (!saved.has(key)) saved.set(key, process.env[key]);
  }
}

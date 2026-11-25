import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createMemoryDataClient } from "./memory-letters";
import type { Session } from "./session";
import { loadUserKeys, saveUserKeys } from "./user-keys";

describe("user keys", () => {
  it("keeps each account's keys separate and reports a missing table", async () => {
    const secrets: { id: string; user_id: string }[] = [];
    const first = session("user-a", secrets);
    const saved = await saveUserKeys(first, { grok: "grok-user-key-1234" });
    assert.ok(!(saved instanceof Response));
    if (saved instanceof Response) return;
    assert.equal(saved.grok, "grok-user-key-1234");

    const second = session("user-b", secrets);
    const other = await loadUserKeys(second);
    assert.equal(other.ok, true);
    if (!other.ok) return;
    assert.equal(other.keys.grok, "");

    const cleared = await saveUserKeys(first, { grok: "" });
    assert.ok(!(cleared instanceof Response));
    if (cleared instanceof Response) return;
    assert.equal(cleared.grok, "");

    const missing = session("user-a", secrets, "42P01");
    const failed = await saveUserKeys(missing, { gemini: "gemini-user-key" });
    assert.ok(failed instanceof Response);
    if (!(failed instanceof Response)) return;
    assert.equal(failed.status, 500);
    const loaded = await loadUserKeys(missing);
    assert.equal(loaded.ok, false);
    if (loaded.ok) return;
    assert.equal(loaded.missing, true);
  });
});

function session(
  userId: string,
  secrets: { id: string; user_id: string }[],
  secretsError?: string,
): Session {
  return {
    data: createMemoryDataClient([], { secrets, secretsError }) as unknown as SupabaseClient,
    userId,
    email: `${userId}@example.com`,
  };
}

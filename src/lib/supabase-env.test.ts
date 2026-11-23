import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readPublishableKey, readSecretKey, readSupabaseUrl, supabaseSetupIssues } from "./supabase-env";

describe("supabase keys", () => {
  it("accepts publishable and secret keys and rejects legacy JWTs", () => {
    assert.equal(readPublishableKey("sb_publishable_example"), "sb_publishable_example");
    assert.equal(readSecretKey("sb_secret_example"), "sb_secret_example");
    assert.equal(readPublishableKey("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.legacy"), null);
    assert.equal(readSecretKey("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.legacy"), null);
    assert.equal(readPublishableKey("sb_secret_example"), null);
    assert.equal(readSecretKey("sb_publishable_example"), null);
    assert.equal(readPublishableKey("sb_publishable_"), null);
    assert.equal(readSecretKey("  "), null);
    assert.equal(readPublishableKey("\"sb_publishable_example\""), "sb_publishable_example");
    assert.equal(readSecretKey("'sb_secret_example'"), "sb_secret_example");
  });

  it("accepts only https project URLs, plus local http", () => {
    assert.equal(readSupabaseUrl("https://example.supabase.co"), "https://example.supabase.co");
    assert.equal(readSupabaseUrl("http://127.0.0.1:54321"), "http://127.0.0.1:54321");
    assert.equal(readSupabaseUrl("http://example.supabase.co"), null);
    assert.equal(readSupabaseUrl("\"https://example.supabase.co\""), "https://example.supabase.co");
  });

  it("names the missing or rejected value without returning it", () => {
    assert.deepEqual(supabaseSetupIssues({}), [
      { name: "SUPABASE_URL", reason: "missing" },
      { name: "SUPABASE_PUBLISHABLE_KEY", reason: "missing" },
      { name: "SUPABASE_SECRET_KEY", reason: "missing" },
    ]);
    assert.deepEqual(
      supabaseSetupIssues({
        url: "postgres://db.example",
        publishable: "eyJhbGciOiJIUzI1NiJ9.legacy",
        secret: "sb_secret_example",
      }),
      [
        { name: "SUPABASE_URL", reason: "invalid" },
        { name: "SUPABASE_PUBLISHABLE_KEY", reason: "invalid" },
      ],
    );
  });
});

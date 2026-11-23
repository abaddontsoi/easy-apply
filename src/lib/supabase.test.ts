import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createMemoryDataClient } from "./memory-letters";
import { createAuthClient, createDataClient, setSupabaseTestDoubles, supabaseConfigured } from "./supabase";

const KEYS = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "COVER_DESK_E2E",
  "NODE_ENV",
] as const;

const saved = new Map<string, string | undefined>();

describe("supabase clients", { concurrency: 1 }, () => {
  afterEach(() => {
    writeEnv("NODE_ENV", "test");
    setSupabaseTestDoubles(null);
    restoreEnv();
  });

  it("stays unconfigured for legacy keys and for a publishable key alone", () => {
    rememberEnv();
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiJ9.legacy.sig";
    process.env.SUPABASE_SECRET_KEY = "eyJhbGciOiJIUzI1NiJ9.legacy.sig";
    delete process.env.COVER_DESK_E2E;
    assert.equal(supabaseConfigured(), false);

    process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test_only";
    delete process.env.SUPABASE_SECRET_KEY;
    assert.equal(supabaseConfigured(), false);
  });

  it("ignores the e2e desk flag and test doubles when NODE_ENV is production", async () => {
    rememberEnv();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
    delete process.env.SUPABASE_SECRET_KEY;
    process.env.COVER_DESK_E2E = "1";
    setSupabaseTestDoubles({
      createDataClient: () => createMemoryDataClient([]) as unknown as SupabaseClient,
      createAuthClient: async () => ({
        auth: {
          async getUser() {
            return { data: { user: { id: "user-a", email: "a@example.com" } }, error: null };
          },
          async signInWithPassword() {
            return { data: { user: null, session: null }, error: { message: "no" } };
          },
          async signUp() {
            return { data: { user: null, session: null }, error: { message: "no" } };
          },
          async signOut() {
            return { error: null };
          },
        },
      }),
    });
    writeEnv("NODE_ENV", "production");
    assert.equal(supabaseConfigured(), false);
    assert.equal(createDataClient(), null);
    assert.equal(await createAuthClient(), null);
    assert.throws(() => setSupabaseTestDoubles(null), /unavailable in production/);
  });

  it("uses an in-memory desk when COVER_DESK_E2E is set outside production", async () => {
    rememberEnv();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
    delete process.env.SUPABASE_SECRET_KEY;
    writeEnv("NODE_ENV", "development");
    process.env.COVER_DESK_E2E = "1";
    setSupabaseTestDoubles(null);
    assert.equal(supabaseConfigured(), true);
    const auth = await createAuthClient();
    assert.ok(auth);
    const user = await auth.auth.getUser();
    assert.equal(user.data.user?.email, "writer@example.com");
    const data = createDataClient();
    assert.ok(data);
    const inserted = await data
      .from("letters")
      .insert({ user_id: user.data.user?.id, role: "Operations Manager" })
      .select("id")
      .single();
    assert.equal(inserted.error, null);
    const listed = await data.from("letters").select("role").eq("user_id", "someone-else");
    assert.deepEqual(listed.data, []);
  });
});

function writeEnv(name: string, value: string): void {
  (process.env as Record<string, string | undefined>)[name] = value;
}

function rememberEnv(): void {
  for (const key of KEYS) saved.set(key, process.env[key]);
}

function restoreEnv(): void {
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  saved.clear();
}

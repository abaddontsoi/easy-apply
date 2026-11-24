import { afterEach, beforeEach } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resetWritesForTests } from "../../src/lib/guard";
import { setJobRunnerForTests } from "../../src/lib/scrape-jobs";
import { createMemoryDataClient, type MemoryLetter } from "../../src/lib/memory-letters";
import { SAMPLE_JOB, SAMPLE_RESUME } from "../../src/lib/sample";
import { setSupabaseTestDoubles, type SupabaseAuthDouble } from "../../src/lib/supabase";

export const TEST_URL = "https://example.supabase.co";
export const TEST_PUBLISHABLE = "sb_publishable_test_only";
export const TEST_SECRET = "sb_secret_test_only";
export const USER_A = { id: "user-a", email: "a@example.com" };
export const USER_B = { id: "user-b", email: "b@example.com" };

const KEYS = [
  "SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "XAI_API_KEY",
  "GEMINI_API_KEY",
  "APIFY_TOKEN",
  "COVER_DESK_E2E",
  "NODE_ENV",
] as const;

const saved = new Map<string, string | undefined>();
const originalFetch = globalThis.fetch;

export function installTestEnv(): void {
  beforeEach(() => {
    for (const key of KEYS) saved.set(key, process.env[key]);
    writeEnv("NODE_ENV", "test");
    clearSecrets();
    setSupabaseTestDoubles(null);
    setJobRunnerForTests(null);
    resetWritesForTests();
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    writeEnv("NODE_ENV", "test");
    setSupabaseTestDoubles(null);
    setJobRunnerForTests(null);
    resetWritesForTests();
    globalThis.fetch = originalFetch;
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    saved.clear();
  });
}

export function clearSecrets(): void {
  delete process.env.SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_PUBLISHABLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  delete process.env.SUPABASE_SECRET_KEY;
  delete process.env.XAI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.APIFY_TOKEN;
  delete process.env.COVER_DESK_E2E;
}

export function configureTestEnv(): void {
  process.env.SUPABASE_URL = TEST_URL;
  process.env.SUPABASE_PUBLISHABLE_KEY = TEST_PUBLISHABLE;
  process.env.SUPABASE_SECRET_KEY = TEST_SECRET;
  delete process.env.COVER_DESK_E2E;
  delete process.env.XAI_API_KEY;
  delete process.env.GEMINI_API_KEY;
}

type Account = { id: string; email: string; password: string };

export type Desk = {
  rows: MemoryLetter[];
  secrets: MemoryLetter[];
  signInAs: (userId: string | null) => void;
};

export function installDesk(users: { id: string; email: string; password?: string }[]): Desk {
  const rows: MemoryLetter[] = [];
  const secrets: MemoryLetter[] = [];
  const accounts = new Map<string, Account>();
  for (const user of users) {
    accounts.set(user.email, { id: user.id, email: user.email, password: user.password ?? "password-ok" });
  }
  let current: Account | null = accounts.get(users[0]?.email ?? "") ?? null;
  setSupabaseTestDoubles({
    createAuthClient: async () =>
      authDouble(
        accounts,
        () => current,
        (next) => {
          current = next;
        },
      ),
    createDataClient: () => createMemoryDataClient(rows, { secrets }) as unknown as SupabaseClient,
  });
  return {
    rows,
    secrets,
    signInAs(userId: string | null) {
      current = [...accounts.values()].find((account) => account.id === userId) ?? null;
    },
  };
}

export function installAuth(auth: SupabaseAuthDouble): void {
  setSupabaseTestDoubles({
    createAuthClient: async () => auth,
    createDataClient: () => createMemoryDataClient([]) as unknown as SupabaseClient,
  });
}

export function letterBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    resume: SAMPLE_RESUME,
    jobDescription: SAMPLE_JOB,
    company: "Lumen Ledger",
    role: "Operations Manager",
    hiringManager: "",
    tone: "professional",
    length: "letter",
    language: "en",
    format: "both",
    provider: "grok",
    letterId: null,
    mode: "structured",
    subject: "Application",
    letter: "I would like to be considered.",
    email: "I am applying.",
    usedFacts: ["Ran the quarterly launch calendar"],
    omissions: [],
    notice: "",
    ...overrides,
  };
}

export function jsonRequest(url: string, body: unknown, method = "POST"): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function readPayload(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

function writeEnv(name: string, value: string): void {
  (process.env as Record<string, string | undefined>)[name] = value;
}

function authDouble(
  accounts: Map<string, Account>,
  current: () => Account | null,
  setCurrent: (account: Account | null) => void,
): SupabaseAuthDouble {
  return {
    auth: {
      async getUser() {
        const user = current();
        if (!user) return { data: { user: null }, error: { message: "no session" } };
        return { data: { user: { id: user.id, email: user.email } }, error: null };
      },
      async signInWithPassword(credentials) {
        const account = accounts.get(credentials.email);
        if (!account || account.password !== credentials.password) {
          return { data: { user: null, session: null }, error: { message: "invalid" } };
        }
        setCurrent(account);
        return { data: { user: { id: account.id, email: account.email }, session: {} }, error: null };
      },
      async signUp(credentials) {
        if (accounts.has(credentials.email)) {
          return { data: { user: null, session: null }, error: { message: "exists" } };
        }
        const account = { id: crypto.randomUUID(), email: credentials.email, password: credentials.password };
        accounts.set(account.email, account);
        setCurrent(account);
        return { data: { user: { id: account.id, email: account.email }, session: {} }, error: null };
      },
      async signOut() {
        setCurrent(null);
        return { error: null };
      },
    },
  };
}

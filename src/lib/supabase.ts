import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createMemoryDataClient, type MemoryLetter } from "@/lib/memory-letters";
import {
  readPublishableKey,
  readSecretKey,
  readSupabaseUrl,
  supabaseSetupIssues,
  type SetupIssue,
} from "@/lib/supabase-env";

const E2E_USER = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "writer@example.com",
};

export type SupabaseAuthDouble = {
  auth: {
    getUser: () => Promise<{
      data: { user: { id: string; email?: string | null } | null };
      error: { message: string } | null;
    }>;
    signInWithPassword: (credentials: { email: string; password: string }) => Promise<{
      data: { user: { id: string; email?: string | null } | null; session: unknown };
      error: { message: string } | null;
    }>;
    signUp: (credentials: { email: string; password: string }) => Promise<{
      data: { user: { id: string; email?: string | null } | null; session: unknown };
      error: { message: string } | null;
    }>;
    signOut: () => Promise<{ error: { message: string } | null }>;
  };
};

type AuthClient = NonNullable<Awaited<ReturnType<typeof openAuthClient>>>;

let authFactory: (() => Promise<SupabaseAuthDouble | null>) | null = null;
let dataFactory: (() => SupabaseClient | null) | null = null;
let e2eLetters: MemoryLetter[] | null = null;
let e2eSecrets: MemoryLetter[] | null = null;
let e2eResumes: MemoryLetter[] | null = null;
let e2eKeywords: MemoryLetter[] | null = null;

export function supabaseConfigured(): boolean {
  if (e2eDeskEnabled()) return true;
  return supabaseSetupIssues(currentSupabaseEnv()).length === 0;
}

export function supabaseConfigurationIssues(): SetupIssue[] {
  if (e2eDeskEnabled()) return [];
  return supabaseSetupIssues(currentSupabaseEnv());
}

export function allowServiceUserForTests(): void {
  const user = { id: "00000000-0000-4000-8000-0000000000aa", email: "writer@example.com" };
  setSupabaseTestDoubles({
    createAuthClient: async () => ({
      auth: {
        async getUser() {
          return { data: { user }, error: null };
        },
        async signInWithPassword() {
          return { data: { user, session: {} }, error: null };
        },
        async signUp() {
          return { data: { user, session: {} }, error: null };
        },
        async signOut() {
          return { error: null };
        },
      },
    }),
  });
}

export function setSupabaseTestDoubles(
  doubles: {
    createAuthClient?: () => Promise<SupabaseAuthDouble | null>;
    createDataClient?: () => SupabaseClient | null;
  } | null,
): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Supabase test doubles are unavailable in production.");
  }
  authFactory = doubles?.createAuthClient ?? null;
  dataFactory = doubles?.createDataClient ?? null;
}

export async function createAuthClient(): Promise<AuthClient | null> {
  if (process.env.NODE_ENV !== "production") {
    if (authFactory) return (await authFactory()) as AuthClient | null;
    if (process.env.COVER_DESK_E2E === "1") return e2eAuthClient() as AuthClient;
  }
  return openAuthClient();
}

async function openAuthClient() {
  const url = supabaseUrl();
  const key = publishableKey();
  if (!url || !key) return null;
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies. Middleware refreshes the session.
        }
      },
    },
  });
}

export function createDataClient(): SupabaseClient | null {
  if (process.env.NODE_ENV !== "production") {
    if (dataFactory) return dataFactory();
    if (process.env.COVER_DESK_E2E === "1") return e2eDataClient();
  }
  const url = supabaseUrl();
  const key = secretKey();
  if (!url || !key) return null;
  return createSupabaseClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function currentSupabaseEnv() {
  return {
    url: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishable: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    secret: process.env.SUPABASE_SECRET_KEY,
  };
}

function supabaseUrl(): string | null {
  return readSupabaseUrl(currentSupabaseEnv().url);
}

function publishableKey(): string | null {
  return readPublishableKey(currentSupabaseEnv().publishable);
}

function secretKey(): string | null {
  return readSecretKey(currentSupabaseEnv().secret);
}

function e2eDeskEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.COVER_DESK_E2E === "1";
}

function e2eAuthClient(): SupabaseAuthDouble {
  const user = { id: E2E_USER.id, email: E2E_USER.email };
  return {
    auth: {
      async getUser() {
        return { data: { user }, error: null };
      },
      async signInWithPassword() {
        return { data: { user, session: {} }, error: null };
      },
      async signUp() {
        return { data: { user, session: {} }, error: null };
      },
      async signOut() {
        return { error: null };
      },
    },
  };
}

function e2eDataClient(): SupabaseClient {
  e2eLetters ??= [];
  e2eSecrets ??= [];
  e2eResumes ??= [];
  e2eKeywords ??= [];
  return createMemoryDataClient(e2eLetters, {
    secrets: e2eSecrets,
    resumes: e2eResumes,
    keywords: e2eKeywords,
  }) as unknown as SupabaseClient;
}

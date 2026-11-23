import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { readPublishableKey, readSupabaseUrl } from "@/lib/supabase-env";

type PendingCookie = {
  name: string;
  value: string;
  options: CookieOptions;
};

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = readSupabaseUrl(process.env.SUPABASE_URL);
  const key = readPublishableKey(process.env.SUPABASE_PUBLISHABLE_KEY);
  if (!url || !key) return response;

  const pending: PendingCookie[] = [];
  const cacheHeaders = new Map<string, string>();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        // Server Components only see this request's cookies. The response cookies are for the browser.
        for (const cookie of cookiesToSet) {
          request.cookies.set(cookie.name, cookie.value);
          const index = pending.findIndex((item) => item.name === cookie.name);
          if (index === -1) pending.push(cookie);
          else pending[index] = cookie;
        }
        for (const [name, value] of Object.entries(headers)) {
          if (value) cacheHeaders.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of pending) {
          response.cookies.set(name, value, options);
        }
        for (const [name, value] of cacheHeaders) {
          response.headers.set(name, value);
        }
      },
    },
  });
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

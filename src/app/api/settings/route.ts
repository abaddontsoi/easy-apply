import { describeKeys, parseKeyPatch } from "@/lib/credentials";
import { privateJson, readJson } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { keysForRequest, saveUserKeys } from "@/lib/user-keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireUser();
  if (session instanceof Response) return session;
  const keys = await keysForRequest(session);
  if (keys instanceof Response) return keys;
  return privateJson(describeKeys(keys));
}

export async function POST(request: Request) {
  const session = await requireUser();
  if (session instanceof Response) return session;
  const body = await readJson(request, 4_000);
  if (!body.ok) return body.response;
  const parsed = parseKeyPatch(body.value);
  if (!parsed.ok) return privateJson({ error: parsed.error }, 400);
  const saved = await saveUserKeys(session, parsed.patch);
  if (saved instanceof Response) return saved;
  return privateJson(describeKeys(saved));
}

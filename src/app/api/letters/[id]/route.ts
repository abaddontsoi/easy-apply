import { parseLetterId, parseSavedLetter } from "@/lib/draft";
import { privateJson, readJson } from "@/lib/http";
import { readLetter, removeLetter, saveLetter } from "@/lib/letters";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const session = await requireUser();
  if (session instanceof Response) return session;
  const id = parseLetterId((await context.params).id);
  if (!id.ok || !id.id) return privateJson({ error: "這封信的編號不正確。" }, 400);
  const letter = await readLetter(session, id.id);
  if (letter instanceof Response) return letter;
  return privateJson({ letter });
}

export async function PATCH(request: Request, context: Context) {
  const session = await requireUser();
  if (session instanceof Response) return session;
  const id = parseLetterId((await context.params).id);
  if (!id.ok || !id.id) return privateJson({ error: "這封信的編號不正確。" }, 400);
  const body = await readJson(request, 80_000);
  if (!body.ok) return body.response;
  const parsed = parseSavedLetter(body.value);
  if (!parsed.ok) return privateJson({ error: parsed.error }, 400);
  const saved = await saveLetter(session, id.id, parsed.value, parsed.value);
  if (saved instanceof Response) return saved;
  return privateJson({ id: saved.id, stored: true });
}

export async function DELETE(_request: Request, context: Context) {
  const session = await requireUser();
  if (session instanceof Response) return session;
  const id = parseLetterId((await context.params).id);
  if (!id.ok || !id.id) return privateJson({ error: "這封信的編號不正確。" }, 400);
  const failure = await removeLetter(session, id.id);
  if (failure) return failure;
  return privateJson({ ok: true });
}

import { parseSavedLetter } from "@/lib/draft";
import { privateJson, readJson } from "@/lib/http";
import { listLetters, saveLetter } from "@/lib/letters";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireUser();
  if (session instanceof Response) return session;
  const letters = await listLetters(session);
  if (letters instanceof Response) return letters;
  return privateJson({ letters });
}

export async function POST(request: Request) {
  const session = await requireUser();
  if (session instanceof Response) return session;
  const body = await readJson(request, 80_000);
  if (!body.ok) return body.response;
  const parsed = parseSavedLetter(body.value);
  if (!parsed.ok) return privateJson({ error: parsed.error }, 400);
  const { letterId, ...letter } = parsed.value;
  const saved = await saveLetter(session, letterId, letter, letter);
  if (saved instanceof Response) return saved;
  return privateJson({ id: saved.id, stored: true });
}

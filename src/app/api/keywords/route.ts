import { addKeyword, listKeywords, removeKeyword, keywordFromSelection } from "@/lib/keywords";
import { privateJson, readJson } from "@/lib/http";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireUser();
  if (session instanceof Response) return session;
  const keywords = await listKeywords(session);
  if (keywords instanceof Response) return keywords;
  return privateJson({ keywords });
}

export async function POST(request: Request) {
  const session = await requireUser();
  if (session instanceof Response) return session;
  const body = await readJson(request, 2_000);
  if (!body.ok) return body.response;
  const text = readText(body.value);
  if (!text) return privateJson({ error: "請選取 1 到 80 個字的關鍵字。" }, 400);
  const keyword = await addKeyword(session, text);
  if (keyword instanceof Response) return keyword;
  return privateJson({ keyword });
}

export async function DELETE(request: Request) {
  const session = await requireUser();
  if (session instanceof Response) return session;
  const body = await readJson(request, 2_000);
  if (!body.ok) return body.response;
  const text = readText(body.value);
  if (!keywordFromSelection(text ?? "")) return privateJson({ error: "請選取 1 到 80 個字的關鍵字。" }, 400);
  const removed = await removeKeyword(session, text ?? "");
  if (removed instanceof Response) return removed;
  return privateJson({ ok: true });
}

function readText(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const text = (value as { text?: unknown }).text;
  return typeof text === "string" ? text : null;
}

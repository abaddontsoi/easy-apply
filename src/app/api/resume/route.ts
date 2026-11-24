import { privateJson, readJson } from "@/lib/http";
import { readResume, removeResume, saveResumeText } from "@/lib/resumes";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireUser();
  if (session instanceof Response) return session;
  const resume = await readResume(session);
  if (resume instanceof Response) return resume;
  return privateJson({ resume });
}

export async function PUT(request: Request) {
  const session = await requireUser();
  if (session instanceof Response) return session;
  const body = await readJson(request, 120_000);
  if (!body.ok) return body.response;
  const value = body.value;
  if (!value || typeof value !== "object" || typeof (value as { text?: unknown }).text !== "string") {
    return privateJson({ error: "請送出履歷文字。" }, 400);
  }
  const clearFile = (value as { clearFile?: unknown }).clearFile === true;
  const resume = await saveResumeText(session, (value as { text: string }).text, clearFile);
  if (resume instanceof Response) return resume;
  return privateJson({ resume });
}

export async function DELETE() {
  const session = await requireUser();
  if (session instanceof Response) return session;
  const failure = await removeResume(session);
  if (failure) return failure;
  return privateJson({ ok: true });
}

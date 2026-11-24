import { privateJson } from "@/lib/http";
import { readResumeFile } from "@/lib/resumes";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireUser();
  if (session instanceof Response) return session;
  const file = await readResumeFile(session);
  if (file instanceof Response) return file;
  if (!file) return privateJson({ error: "沒有履歷檔。" }, 404);
  return new Response(Buffer.from(file.bytes), {
    headers: {
      "content-type": file.mediaType,
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

import { ExtractError, extractDocument } from "@/lib/extract";
import { privateJson } from "@/lib/http";
import { resumeFilename, resumeMediaType, saveResumeFile } from "@/lib/resumes";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await requireUser();
  if (session instanceof Response) return session;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return privateJson({ error: "請上傳 PDF、Word 或純文字檔。" }, 400);
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return privateJson({ error: "請選擇履歷檔。" }, 400);
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const extracted = await extractDocument(file.name, bytes);
    const filename = resumeFilename(file.name);
    const saved = await saveResumeFile(session, {
      filename,
      mediaType: resumeMediaType(filename),
      bytes,
      text: extracted.text,
      truncated: extracted.truncated,
    });
    if (saved instanceof Response) {
      const failure = (await saved.json().catch(() => null)) as { error?: unknown } | null;
      const saveError = failure && typeof failure.error === "string" ? failure.error : "履歷沒有存進 Supabase。";
      return privateJson({ ...extracted, filename, hasFile: false, saveError });
    }
    return privateJson({
      text: saved.text,
      truncated: saved.truncated,
      filename: saved.filename,
      hasFile: saved.hasFile,
      saveError: "",
    });
  } catch (error) {
    if (error instanceof ExtractError) {
      return privateJson({ error: error.message }, error.status);
    }
    return privateJson({ error: "這個檔案讀不出文字。請改貼履歷。" }, 422);
  }
}

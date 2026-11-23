import { ExtractError, extractDocument } from "@/lib/extract";
import { privateJson } from "@/lib/http";
import { requireIdentity } from "../../../../cursor/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const identity = await requireIdentity(request);
  if (identity instanceof Response) return identity;

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
    return privateJson(await extractDocument(file.name, bytes));
  } catch (error) {
    if (error instanceof ExtractError) {
      return privateJson({ error: error.message }, error.status);
    }
    return privateJson({ error: "這個檔案讀不出文字。請改貼履歷。" }, 422);
  }
}

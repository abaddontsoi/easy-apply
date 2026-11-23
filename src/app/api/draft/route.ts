import { composeStructured } from "@/lib/compose";
import { parseDraftInput } from "@/lib/draft";
import { allowWrite } from "@/lib/guard";
import { privateJson } from "@/lib/http";
import { ModelError, modelConfigured, writeWithModel } from "@/lib/openai";
import { requireIdentity } from "../../../../cursor/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const identity = await requireIdentity(request);
  if (identity instanceof Response) return identity;
  if (!allowWrite(identity.sub)) {
    return privateJson({ error: "這十分鐘已經寫了八次，請稍後再寫。" }, 429);
  }

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 80_000) {
      return privateJson({ error: "內容太長，請剪短履歷或職缺說明。" }, 413);
    }
    body = JSON.parse(raw) as unknown;
  } catch {
    return privateJson({ error: "請送出履歷和職缺說明。" }, 400);
  }

  const parsed = parseDraftInput(body);
  if (!parsed.ok) return privateJson({ error: parsed.error }, 400);

  if (!modelConfigured()) {
    return privateJson(composeStructured(parsed.value));
  }

  try {
    return privateJson(await writeWithModel(parsed.value));
  } catch (error) {
    const draft = composeStructured(parsed.value);
    draft.notice =
      error instanceof ModelError && error.code === "unauthorized"
        ? "OpenAI 沒有接受這把金鑰，所以改用結構草稿。請在 Cursor Secrets 檢查 OPENAI_API_KEY。"
        : "模型這次沒有完成，所以改用結構草稿。句子仍來自履歷原文。";
    return privateJson(draft);
  }
}

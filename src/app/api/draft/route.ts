import { composeStructured } from "@/lib/compose";
import { resolveModelKey } from "@/lib/credentials";
import { parseDraftInput, parseLetterId, parseRevision, type DraftOutput, type DraftRevision } from "@/lib/draft";
import { allowWrite } from "@/lib/guard";
import { privateJson, readJson } from "@/lib/http";
import { saveLetter } from "@/lib/letters";
import { ModelError, fallbackNotice, writeWithModel } from "@/lib/models";
import { UnauthenticatedError, requireUser } from "@/lib/session";
import { keysForRequest } from "@/lib/user-keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await requireUser();
  if (session instanceof Response) return session;
  const keys = await keysForRequest(session);
  if (keys instanceof Response) return keys;
  if (!allowWrite(session.userId)) {
    return privateJson({ error: "這十分鐘已經寫了八次，請稍後再寫。" }, 429);
  }

  const body = await readJson(request, 80_000);
  if (!body.ok) return body.response;
  const parsed = parseDraftInput(body.value);
  if (!parsed.ok) return privateJson({ error: parsed.error }, 400);
  const revision = parseRevision(body.value);
  if (!revision.ok) return privateJson({ error: revision.error }, 400);
  const letterId = parseLetterId(
    body.value && typeof body.value === "object" ? (body.value as { letterId?: unknown }).letterId : null,
  );
  if (!letterId.ok) return privateJson({ error: letterId.error }, 400);

  let draft = composeStructured(parsed.value);
  const resolved = resolveModelKey(parsed.value.provider, keys);
  if (!resolved.value) {
    const code = resolved.source === "none" ? "missing" : "unauthorized";
    const source = resolved.source === "user" ? "user" : "system";
    const notice = fallbackNotice(parsed.value.provider, code, source);
    draft = revision.revision ? keepRevision(revision.revision, notice) : { ...draft, notice };
  } else {
    try {
      draft = await writeWithModel(
        parsed.value,
        keys,
        revision.revision
          ? {
              instruction: revision.revision.instruction,
              subject: revision.revision.subject,
              letter: revision.revision.letter,
              email: revision.revision.email,
            }
          : undefined,
      );
    } catch (error) {
      if (error instanceof UnauthenticatedError) return privateJson({ error: "請先登入。" }, 401);
      const code = error instanceof ModelError ? error.code : "unavailable";
      const source = resolved.source === "user" ? "user" : "system";
      const notice = fallbackNotice(parsed.value.provider, code, source);
      draft = revision.revision
        ? keepRevision(revision.revision, notice)
        : { ...composeStructured(parsed.value), notice };
    }
  }

  const saved = await saveLetter(session, letterId.id, parsed.value, draft);
  if (saved instanceof Response) {
    const failure = (await saved.json()) as { error?: string };
    return privateJson({
      ...draft,
      provider: parsed.value.provider,
      id: letterId.id,
      stored: false,
      saveError: failure.error ?? "Supabase 這次沒有存成。",
    });
  }
  return privateJson({ ...draft, provider: parsed.value.provider, id: saved.id, stored: true, saveError: "" });
}

function keepRevision(revision: DraftRevision, notice: string): DraftOutput {
  return {
    mode: revision.mode,
    subject: revision.subject,
    letter: revision.letter,
    email: revision.email,
    usedFacts: revision.usedFacts,
    omissions: revision.omissions,
    notice,
  };
}

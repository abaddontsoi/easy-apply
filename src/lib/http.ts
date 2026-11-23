export function privateJson(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { "cache-control": "private, no-store" },
  });
}

export async function readJson(
  request: Request,
  maxLength: number,
): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  try {
    const raw = await request.text();
    if (raw.length > maxLength) {
      return { ok: false, response: privateJson({ error: "內容太長，請剪短履歷或職缺說明。" }, 413) };
    }
    return { ok: true, value: JSON.parse(raw) as unknown };
  } catch {
    return { ok: false, response: privateJson({ error: "請送出完整的內容。" }, 400) };
  }
}

/** Han counts as one token. Other text counts as one token per four characters. */
export function estimateTokens(text: string): number {
  const han = text.match(/\p{Script=Han}/gu)?.length ?? 0;
  return han + Math.ceil((text.length - han) / 4);
}

/** Budgets for the letter prompt. A full résumé plus a full job description can be 40,000 characters. */
export const SOURCE_TOKEN_BUDGET = {
  resume: 8_000,
  job: 4_000,
} as const;

/**
 * Character caps for rewritten text.
 * N characters stay within N tokens even when every character is Han.
 */
export const SOURCE_CHAR_CAP = {
  resume: 6_000,
  job: 3_000,
} as const;

/** Largest source slice sent to one rewrite call, so that call stays inside a small context window. */
export const REWRITE_INPUT_CHARS = 8_000;

const REWRITE_SYSTEM = `You compress source material for a later writing step.
Copy facts only. Never invent employers, titles, dates, metrics, tools, degrees, languages, or requirements.
Keep the original language. Plain text. No markdown and no preamble.`;

export type RewriteFn = (system: string, user: string, maxTokens: number) => Promise<string>;

export async function fitSources(
  resume: string,
  jobDescription: string,
  rewrite: RewriteFn,
): Promise<{ resume: string; jobDescription: string }> {
  const [nextResume, nextJob] = await Promise.all([
    fitOne(resume, "resume", rewrite),
    fitOne(jobDescription, "job", rewrite),
  ]);
  return { resume: nextResume, jobDescription: nextJob };
}

export function splitForRewrite(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const chunks: string[] = [];
  let current = "";
  const take = (block: string) => {
    if (!block) return;
    if (!current) {
      current = block;
      return;
    }
    if (current.length + 2 + block.length <= maxChars) {
      current = `${current}\n\n${block}`;
      return;
    }
    chunks.push(current);
    current = block;
  };
  for (const part of text.split(/\n{2,}/)) {
    const block = part.trim();
    if (!block) continue;
    if (block.length <= maxChars) {
      take(block);
      continue;
    }
    if (current) {
      chunks.push(current);
      current = "";
    }
    for (let index = 0; index < block.length; index += maxChars) {
      chunks.push(block.slice(index, index + maxChars));
    }
  }
  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : [text.slice(0, maxChars)];
}

export function condenseDeterministic(text: string, maxChars: number): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return text.trim().slice(0, maxChars);
  const headCount = Math.min(6, lines.length);
  const selected = new Set(lines.slice(0, headCount));
  const ranked = lines
    .slice(headCount)
    .map((line, index) => ({ line, index, score: scoreLine(line) }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  let used = lines.slice(0, headCount).join("\n").length;
  for (const candidate of ranked) {
    const next = used + 1 + candidate.line.length;
    if (next > maxChars) continue;
    selected.add(candidate.line);
    used = next;
  }
  const kept = lines.filter((line) => selected.has(line));
  return clipChars(kept.join("\n"), maxChars);
}

export function clipChars(text: string, maxChars: number): string {
  const cleaned = text.replace(/\u0000/g, "").trim();
  if (cleaned.length <= maxChars) return cleaned;
  const slice = cleaned.slice(0, maxChars);
  const breakAt = Math.max(slice.lastIndexOf("\n"), slice.lastIndexOf("。"), slice.lastIndexOf(". "));
  if (breakAt >= Math.floor(maxChars * 0.6)) return slice.slice(0, breakAt).trim();
  return slice.trim();
}

async function fitOne(text: string, kind: "resume" | "job", rewrite: RewriteFn): Promise<string> {
  if (estimateTokens(text) <= SOURCE_TOKEN_BUDGET[kind]) return text;
  const cap = SOURCE_CHAR_CAP[kind];
  const chunks = splitForRewrite(text, REWRITE_INPUT_CHARS);
  const perChunk = Math.max(500, Math.floor(cap / chunks.length));
  const pieces = await Promise.all(chunks.map((chunk) => rewriteOrClip(kind, chunk, perChunk, rewrite)));
  let joined = pieces.map((piece) => piece.trim()).filter(Boolean).join("\n\n");
  if (!joined) return condenseDeterministic(text, cap);
  if (chunks.length > 1 && (estimateTokens(joined) > SOURCE_TOKEN_BUDGET[kind] || joined.length > cap)) {
    joined = await rewriteOrClip(kind, clipChars(joined, REWRITE_INPUT_CHARS), cap, rewrite);
  }
  return clipChars(joined, cap);
}

async function rewriteOrClip(
  kind: "resume" | "job",
  text: string,
  maxChars: number,
  rewrite: RewriteFn,
): Promise<string> {
  try {
    const raw = await rewrite(REWRITE_SYSTEM, rewriteUser(kind, text, maxChars), rewriteTokens(maxChars));
    const plain = unwrapRewrite(raw);
    if (plain) return clipChars(plain, maxChars);
  } catch (error) {
    if (isFatal(error)) throw error;
  }
  return condenseDeterministic(text, maxChars);
}

function rewriteUser(kind: "resume" | "job", text: string, maxChars: number): string {
  const task =
    kind === "resume"
      ? "Compress this résumé. Keep the name, contact details, employers, titles, dates, metrics, tools, degrees, and languages. Drop layout noise and repeated duties."
      : "Compress this job description. Keep the company, role, responsibilities, and requirements. Drop benefits, legal boilerplate, and marketing.";
  return `${task}\nStay under ${maxChars} characters.\n\n"""\n${text}\n"""`;
}

function rewriteTokens(maxChars: number): number {
  return Math.min(2_000, Math.ceil(maxChars / 2) + 200);
}

function unwrapRewrite(text: string): string {
  return text
    .trim()
    .replace(/^```(?:text|markdown|md)?/i, "")
    .replace(/```$/, "")
    .trim();
}

function scoreLine(line: string): number {
  let score = 0;
  if (/^[-*•–]/.test(line) || /^\d+[.)]/.test(line)) score += 2;
  if (/\d/.test(line)) score += 2;
  if (line.length >= 20 && line.length <= 180) score += 1;
  return score;
}

function isFatal(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  return code === "unauthorized" || code === "unavailable";
}

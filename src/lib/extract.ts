const MAX_BYTES = 4 * 1024 * 1024;
const MAX_CHARS = 20_000;

export class ExtractError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ExtractError";
    this.status = status;
  }
}

export async function extractDocument(
  filename: string,
  bytes: Uint8Array,
): Promise<{ text: string; truncated: boolean }> {
  if (bytes.byteLength === 0) {
    throw new ExtractError(422, "這個檔案是空的。");
  }
  if (bytes.byteLength > MAX_BYTES) {
    throw new ExtractError(413, "檔案請小於 4MB。");
  }
  const extension = fileExtension(filename);
  let text = "";
  if (extension === "txt" || extension === "md") {
    text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } else if (extension === "docx") {
    text = await readDocx(bytes);
  } else if (extension === "pdf") {
    text = await readPdf(bytes);
  } else {
    throw new ExtractError(415, "請上傳 PDF、Word（.docx）或純文字檔。");
  }
  text = text.replace(/\u0000/g, "").replace(/\r\n/g, "\n").trim();
  if (!text) {
    throw new ExtractError(422, "這個檔案讀不出文字。若是掃描版履歷，請改貼文字。");
  }
  const truncated = text.length > MAX_CHARS;
  return { text: truncated ? text.slice(0, MAX_CHARS) : text, truncated };
}

function fileExtension(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot + 1).toLowerCase() : "";
}

async function readDocx(bytes: Uint8Array): Promise<string> {
  const mammoth = await import("mammoth");
  try {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return result.value ?? "";
  } catch {
    throw new ExtractError(422, "這份 Word 檔讀不出來。請另存為 .docx，或改貼文字。");
  }
}

async function readPdf(bytes: Uint8Array): Promise<string> {
  if (bytes.byteLength < 5 || new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") {
    throw new ExtractError(422, "這個檔案不是可讀的 PDF。");
  }
  try {
    const { extractText } = await import("unpdf");
    const extracted = await extractText(bytes, { mergePages: true });
    return extracted.text;
  } catch {
    throw new ExtractError(422, "這個 PDF 讀不出文字。若它是掃描檔，請改貼文字。");
  }
}

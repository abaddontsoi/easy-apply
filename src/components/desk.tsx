"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { DraftOutput, Format, Language, Length, Tone, Viewer } from "@/lib/draft";
import {
  SAMPLE_COMPANY,
  SAMPLE_JOB,
  SAMPLE_RESUME,
  SAMPLE_ROLE,
} from "@/lib/sample";
import { cn } from "@/lib/utils";
import { Copy, Download, FileUp, PenLine } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

const STORAGE_KEY = "hanjian.draft.v1";

const TONE_ITEMS: Record<Tone, string> = {
  professional: "穩重",
  warm: "誠懇",
  confident: "自信",
  direct: "直白",
};

const LENGTH_ITEMS: Record<Length, string> = {
  email: "短電郵",
  letter: "標準信",
  detailed: "較完整",
};

const LANGUAGE_ITEMS: Record<Language, string> = {
  en: "English",
  "zh-Hant": "繁體中文",
};

const FORMAT_ITEMS: Record<Format, string> = {
  letter: "求職信",
  email: "應徵電郵",
  both: "信和電郵",
};

type Pane = "letter" | "email";

export function Desk({
  viewer,
  modelReady,
}: {
  viewer: Viewer | null;
  modelReady: boolean;
}) {
  const [resume, setResume] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [hiringManager, setHiringManager] = useState("");
  const [tone, setTone] = useState<Tone>("professional");
  const [length, setLength] = useState<Length>("letter");
  const [language, setLanguage] = useState<Language>("en");
  const [format, setFormat] = useState<Format>("both");
  const [remember, setRemember] = useState(true);
  const [ready, setReady] = useState(false);
  const [reading, setReading] = useState(false);
  const [fileNote, setFileNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<DraftOutput | null>(null);
  const [letter, setLetter] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [pane, setPane] = useState<Pane>("letter");
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const stored = JSON.parse(raw) as Partial<StoredDraft>;
        if (stored.remember === false) {
          setRemember(false);
        } else {
          if (typeof stored.resume === "string") setResume(stored.resume);
          if (typeof stored.jobDescription === "string") setJobDescription(stored.jobDescription);
          if (typeof stored.company === "string") setCompany(stored.company);
          if (typeof stored.role === "string") setRole(stored.role);
          if (typeof stored.hiringManager === "string") setHiringManager(stored.hiringManager);
          if (isTone(stored.tone)) setTone(stored.tone);
          if (isLength(stored.length)) setLength(stored.length);
          if (isLanguage(stored.language)) setLanguage(stored.language);
          if (isFormat(stored.format)) setFormat(stored.format);
        }
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const payload: StoredDraft = remember
      ? { remember, resume, jobDescription, company, role, hiringManager, tone, length, language, format }
      : { remember: false };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [
    ready,
    remember,
    resume,
    jobDescription,
    company,
    role,
    hiringManager,
    tone,
    length,
    language,
    format,
  ]);

  useEffect(() => {
    if (!result) return;
    resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [result]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!viewer) return;
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          resume,
          jobDescription,
          company,
          role,
          hiringManager,
          tone,
          length,
          language,
          format,
        }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setError(readError(payload) ?? "這次沒有寫成。");
        return;
      }
      if (!isDraft(payload)) {
        setError("回傳的文稿不完整，請再寫一次。");
        return;
      }
      setResult(payload);
      setLetter(payload.letter);
      setEmail(payload.email);
      setSubject(payload.subject);
      setPane(payload.letter ? "letter" : "email");
    } catch {
      setError("連不上撰寫服務。");
    } finally {
      setLoading(false);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setFileNote("");
    setReading(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch("/api/extract", { method: "POST", body });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setFileNote(readError(payload) ?? "讀不到這個檔案。");
        return;
      }
      if (!payload || typeof payload !== "object" || typeof (payload as { text?: unknown }).text !== "string") {
        setFileNote("讀不到這個檔案。");
        return;
      }
      const extracted = payload as { text: string; truncated?: boolean };
      setResume(extracted.text);
      setFileNote(extracted.truncated ? "檔案較長，已放入前 20,000 字。" : `已讀入 ${file.name}`);
    } catch {
      setFileNote("讀不到這個檔案。請改貼履歷。");
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function loadSample() {
    setResume(SAMPLE_RESUME);
    setJobDescription(SAMPLE_JOB);
    setCompany(SAMPLE_COMPANY);
    setRole(SAMPLE_ROLE);
    setHiringManager("");
    setLanguage("en");
    setFormat("both");
    setFileNote("已載入虛構範例。Chloe Chan 不是真人。");
    setError("");
  }

  function clearAll() {
    setResume("");
    setJobDescription("");
    setCompany("");
    setRole("");
    setHiringManager("");
    setResult(null);
    setLetter("");
    setEmail("");
    setSubject("");
    setFileNote("");
    setError("");
  }

  const showLetter = Boolean(letter);
  const showEmail = Boolean(email);
  const activePane: Pane = showLetter && showEmail ? pane : showEmail ? "email" : "letter";
  const activeText = activePane === "email" ? emailWithSubject(subject, email, language) : letter;

  return (
    <div className="min-h-screen">
      {viewer?.simulated ? (
        <p className="bg-accent px-4 py-2 text-center text-sm text-accent-foreground">
          本地預覽使用模擬身分，不是你的 Cursor 帳號。發布後只會認出已登入的你。
        </p>
      ) : null}
      <header className="border-b border-border/80">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
          <div className="flex items-start gap-3">
            <div
              aria-hidden
              className="grid size-11 shrink-0 place-items-center rounded-md bg-primary font-serif text-xl text-primary-foreground"
            >
              函
            </div>
            <div>
              <h1 className="font-serif text-3xl leading-none tracking-tight">函箋</h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                把履歷和目標職缺放在一起，寫求職信或應徵電郵。文稿只使用履歷裡寫過的事實。
              </p>
            </div>
          </div>
          <p className="text-sm sm:text-right">
            {viewer ? (
              <>
                <span className="block font-medium">
                  {viewer.kind === "key" ? `金鑰 ${viewer.name || "未命名"}` : viewer.name || "已登入"}
                </span>
                {viewer.email ? (
                  <span className="text-muted-foreground">{viewer.email}</span>
                ) : null}
              </>
            ) : (
              <span className="text-muted-foreground">需要登入才能撰寫</span>
            )}
          </p>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-xl">材料</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={onSubmit}>
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="resume">履歷</Label>
                  <span className={counterClass(resume.length)}>{resume.length.toLocaleString("zh-Hant")} / 20,000</span>
                </div>
                <Textarea
                  id="resume"
                  value={resume}
                  maxLength={20000}
                  onChange={(event) => setResume(event.target.value)}
                  placeholder="貼上履歷，或上傳 PDF、Word、純文字。"
                  className="min-h-52 resize-y"
                />
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf,.docx,.txt,.md,application/pdf,text/plain"
                    className="sr-only"
                    onChange={(event) => void onFile(event.target.files?.[0])}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!viewer || reading}
                    onClick={() => fileRef.current?.click()}
                  >
                    <FileUp />
                    {reading ? "讀取中" : "上傳履歷"}
                  </Button>
                  <Button type="button" variant="outline" onClick={loadSample}>
                    載入範例
                  </Button>
                  <Button type="button" variant="ghost" onClick={clearAll}>
                    清除
                  </Button>
                </div>
                {fileNote ? <p className="text-xs text-muted-foreground">{fileNote}</p> : null}
              </div>

              <div className="grid gap-1.5">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="job">職缺說明</Label>
                  <span className={counterClass(jobDescription.length)}>
                    {jobDescription.length.toLocaleString("zh-Hant")} / 20,000
                  </span>
                </div>
                <Textarea
                  id="job"
                  value={jobDescription}
                  maxLength={20000}
                  onChange={(event) => setJobDescription(event.target.value)}
                  placeholder="貼上招聘頁或職缺描述。"
                  className="min-h-40 resize-y"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="company">公司</Label>
                  <Input
                    id="company"
                    value={company}
                    maxLength={120}
                    onChange={(event) => setCompany(event.target.value)}
                    placeholder="可不填"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="role">職位</Label>
                  <Input
                    id="role"
                    value={role}
                    maxLength={120}
                    onChange={(event) => setRole(event.target.value)}
                    placeholder="可不填"
                  />
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="manager">收件人</Label>
                <Input
                  id="manager"
                  value={hiringManager}
                  maxLength={120}
                  onChange={(event) => setHiringManager(event.target.value)}
                  placeholder="知道姓名再填，否則用敬啟者"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Choice
                  label="語氣"
                  value={tone}
                  items={TONE_ITEMS}
                  onChange={(value) => setTone(value)}
                />
                <Choice
                  label="篇幅"
                  value={length}
                  items={LENGTH_ITEMS}
                  onChange={(value) => setLength(value)}
                />
                <Choice
                  label="語言"
                  value={language}
                  items={LANGUAGE_ITEMS}
                  onChange={(value) => setLanguage(value)}
                />
                <Choice
                  label="產出"
                  value={format}
                  items={FORMAT_ITEMS}
                  onChange={(value) => setFormat(value)}
                />
              </div>

              <label className="flex items-start gap-2 text-sm leading-5">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-primary"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                />
                <span>在這台瀏覽器記住履歷和職缺。清除或取消勾選就會刪掉。</span>
              </label>

              {!viewer ? (
                <p className="rounded-lg bg-muted px-3 py-2 text-sm">需要以 Cursor 登入才能撰寫。這頁仍可閱讀。</p>
              ) : null}
              {error ? (
                <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              ) : null}

              <Button type="submit" size="lg" className="h-10" disabled={!viewer || loading}>
                <PenLine />
                {loading ? "正在對照履歷與職缺" : "撰寫"}
              </Button>
              <p className="text-xs leading-5 text-muted-foreground">
                {modelReady
                  ? "按下撰寫後，履歷和職缺會送給 OpenAI 生成文稿。函箋不保存這段內容。"
                  : "尚未連接 OpenAI。按下撰寫會用履歷原句組一份結構草稿，並在文稿上標明。金鑰名稱是 OPENAI_API_KEY。"}
              </p>
            </form>
          </CardContent>
        </Card>

        <section ref={resultRef} aria-live="polite">
          <Card className="lg:sticky lg:top-4">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="font-serif text-xl">文稿</CardTitle>
                {result ? (
                  <Badge variant={result.mode === "model" ? "default" : "secondary"}>
                    {result.mode === "model" ? "模型撰寫" : "結構草稿"}
                  </Badge>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="grid gap-4">
              {!result && !loading ? (
                <div className="letter-sheet rounded-lg px-5 py-8">
                  <p className="font-serif text-2xl">信會寫在這裡。</p>
                  <ol className="mt-4 grid list-decimal gap-2 pl-4 text-sm leading-6 text-muted-foreground">
                    <li>貼上履歷，或先載入虛構範例看一次流程。</li>
                    <li>貼上目標職缺，補上公司、職位和收件人。</li>
                    <li>選語言和篇幅，撰寫後可以直接改字，再複製或下載。</li>
                  </ol>
                </div>
              ) : null}
              {loading ? (
                <p className="rounded-lg bg-muted px-4 py-8 text-sm">正在對照履歷與職缺，撰寫中。</p>
              ) : null}
              {result ? (
                <>
                  {result.notice ? (
                    <p className="rounded-lg bg-accent px-3 py-2 text-sm leading-6 text-accent-foreground">
                      {result.notice}
                    </p>
                  ) : null}
                  {showEmail ? (
                    <div className="grid gap-1.5">
                      <Label htmlFor="subject">主旨</Label>
                      <Input id="subject" value={subject} onChange={(event) => setSubject(event.target.value)} />
                    </div>
                  ) : null}
                  {showLetter && showEmail ? (
                    <Tabs value={pane} onValueChange={(value) => setPane(value === "email" ? "email" : "letter")}>
                      <TabsList>
                        <TabsTrigger value="letter">求職信</TabsTrigger>
                        <TabsTrigger value="email">應徵電郵</TabsTrigger>
                      </TabsList>
                      <TabsContent value="letter" className="pt-3">
                        <LetterField
                          id="letter"
                          value={letter}
                          language={language}
                          onChange={setLetter}
                        />
                      </TabsContent>
                      <TabsContent value="email" className="pt-3">
                        <LetterField id="email" value={email} language={language} onChange={setEmail} />
                      </TabsContent>
                    </Tabs>
                  ) : showLetter ? (
                    <LetterField id="letter" value={letter} language={language} onChange={setLetter} />
                  ) : (
                    <LetterField id="email" value={email} language={language} onChange={setEmail} />
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={() => void copyText(activeText, setCopied)}>
                      <Copy />
                      {copied ? "已複製" : "複製"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        download(
                          activePane === "email" ? "application-email.txt" : "cover-letter.txt",
                          activeText,
                        )
                      }
                    >
                      <Download />
                      下載
                    </Button>
                  </div>
                  {result.usedFacts.length > 0 ? (
                    <details open className="text-sm">
                      <summary className="cursor-pointer font-medium">文稿對上的履歷句子</summary>
                      <ul className="mt-2 grid list-disc gap-1 pl-5 text-muted-foreground">
                        {result.usedFacts.map((fact) => (
                          <li key={fact}>{fact}</li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                  {result.omissions.length > 0 ? (
                    <details open className="text-sm">
                      <summary className="cursor-pointer font-medium">履歷沒有支撐的要求</summary>
                      <ul className="mt-2 grid list-disc gap-1 pl-5 text-muted-foreground">
                        {result.omissions.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </>
              ) : null}
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}

function LetterField({
  id,
  value,
  language,
  onChange,
}: {
  id: string;
  value: string;
  language: Language;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="letter-sheet min-h-[28rem] resize-y px-4 py-4 font-serif text-base leading-7 md:text-base"
      />
      <p className="text-xs text-muted-foreground">{measure(value, language)}</p>
    </div>
  );
}

function Choice<T extends string>({
  label,
  value,
  items,
  onChange,
}: {
  label: string;
  value: T;
  items: Record<T, string>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <Select
        value={value}
        items={items}
        onValueChange={(next) => {
          if (typeof next === "string" && next in items) onChange(next as T);
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.entries(items) as [T, string][]).map(([itemValue, itemLabel]) => (
            <SelectItem key={itemValue} value={itemValue}>
              {itemLabel}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

type StoredDraft = {
  remember: boolean;
  resume?: string;
  jobDescription?: string;
  company?: string;
  role?: string;
  hiringManager?: string;
  tone?: Tone;
  length?: Length;
  language?: Language;
  format?: Format;
};

function isTone(value: unknown): value is Tone {
  return value === "professional" || value === "warm" || value === "confident" || value === "direct";
}
function isLength(value: unknown): value is Length {
  return value === "email" || value === "letter" || value === "detailed";
}
function isLanguage(value: unknown): value is Language {
  return value === "en" || value === "zh-Hant";
}
function isFormat(value: unknown): value is Format {
  return value === "letter" || value === "email" || value === "both";
}

function isDraft(value: unknown): value is DraftOutput {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    (record.mode === "model" || record.mode === "structured") &&
    typeof record.subject === "string" &&
    typeof record.letter === "string" &&
    typeof record.email === "string" &&
    typeof record.notice === "string" &&
    Array.isArray(record.usedFacts) &&
    Array.isArray(record.omissions)
  );
}

function readError(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const error = (value as { error?: unknown }).error;
  return typeof error === "string" ? error : null;
}

function counterClass(length: number): string {
  return cn("text-xs", length > 18000 ? "text-destructive" : "text-muted-foreground");
}

function measure(text: string, language: Language): string {
  if (!text.trim()) return language === "zh-Hant" ? "0 字" : "0 words";
  if (language === "zh-Hant") {
    return `${text.replace(/\s/g, "").length.toLocaleString("zh-Hant")} 字`;
  }
  return `${text.trim().split(/\s+/).length.toLocaleString("en")} words`;
}

function emailWithSubject(subject: string, email: string, language: Language): string {
  const label = language === "zh-Hant" ? "主旨" : "Subject";
  return `${label}: ${subject}\n\n${email}`.trim();
}

async function copyText(text: string, setCopied: (value: boolean) => void) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.append(area);
    area.select();
    const copied = document.execCommand("copy");
    area.remove();
    if (!copied) {
      setCopied(false);
      return;
    }
  }
  setCopied(true);
  window.setTimeout(() => setCopied(false), 2000);
}

function download(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

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
import type { DraftMode, DraftOutput, Format, Language, Length, Provider, Tone } from "@/lib/draft";
import type { ProviderStatus } from "@/lib/models";
import {
  SAMPLE_COMPANY,
  SAMPLE_JOB,
  SAMPLE_RESUME,
  SAMPLE_ROLE,
} from "@/lib/sample";
import { cn } from "@/lib/utils";
import { JobSearch } from "@/components/job-search";
import { Copy, Download, FileUp, PenLine, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

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

type Summary = {
  id: string;
  role: string;
  company: string;
  subject: string;
  provider: Provider;
  mode: DraftMode;
  updatedAt: string;
};

type Stored = Summary & {
  resume: string;
  jobDescription: string;
  hiringManager: string;
  tone: Tone;
  length: Length;
  language: Language;
  format: Format;
  letter: string;
  email: string;
  usedFacts: string[];
  omissions: string[];
  notice: string;
};

const hongKongTime = new Intl.DateTimeFormat("zh-Hant-HK", {
  timeZone: "Asia/Hong_Kong",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function Desk({
  email,
  providers,
  keyWarning = "",
}: {
  email: string;
  providers: ProviderStatus;
  keyWarning?: string;
}) {
  const router = useRouter();
  const [resume, setResume] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [hiringManager, setHiringManager] = useState("");
  const [tone, setTone] = useState<Tone>("professional");
  const [length, setLength] = useState<Length>("letter");
  const [language, setLanguage] = useState<Language>("en");
  const [format, setFormat] = useState<Format>("both");
  const [provider, setProvider] = useState<Provider>(providers.grok || !providers.gemini ? "grok" : "gemini");
  const [writtenWith, setWrittenWith] = useState<Provider>("grok");
  const [letterId, setLetterId] = useState<string | null>(null);
  const [letters, setLetters] = useState<Summary[]>([]);
  const [listError, setListError] = useState("");
  const [reading, setReading] = useState(false);
  const [fileNote, setFileNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<DraftOutput | null>(null);
  const [letter, setLetter] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [subject, setSubject] = useState("");
  const [pane, setPane] = useState<Pane>("letter");
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLElement>(null);

  const providerItems: Record<Provider, string> = {
    grok: providers.grok ? "Grok" : "Grok（未連接）",
    gemini: providers.gemini ? "Gemini" : "Gemini（未連接）",
  };

  useEffect(() => {
    void loadList(setLetters, setListError);
  }, []);

  useEffect(() => {
    if (!result) return;
    resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [result]);

  function payload() {
    return {
      resume,
      jobDescription,
      company,
      role,
      hiringManager,
      tone,
      length,
      language,
      format,
      provider,
      letterId,
      subject,
      letter,
      email: emailBody,
      usedFacts: result?.usedFacts ?? [],
      omissions: result?.omissions ?? [],
      mode: result?.mode ?? "structured",
      notice: result?.notice ?? "",
    };
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const body: unknown = await response.json().catch(() => null);
      if (response.status === 401) {
        router.refresh();
        return;
      }
      if (!response.ok && !isDraftResponse(body)) {
        setError(readError(body) ?? "這次沒有寫成。");
        return;
      }
      if (!isDraftResponse(body)) {
        setError("回傳的文稿不完整，請再寫一次。");
        return;
      }
      setResult(body);
      if (body.provider === "grok" || body.provider === "gemini") setWrittenWith(body.provider);
      setLetter(body.letter);
      setEmailBody(body.email);
      setSubject(body.subject);
      setPane(body.letter ? "letter" : "email");
      if (body.id) setLetterId(body.id);
      if (body.saveError) setError(body.saveError);
      await loadList(setLetters, setListError);
    } catch {
      setError("連不上撰寫服務。");
    } finally {
      setLoading(false);
    }
  }

  async function saveCurrent() {
    setError("");
    setSaving(true);
    try {
      const response = await fetch(letterId ? `/api/letters/${letterId}` : "/api/letters", {
        method: letterId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setError(readError(body) ?? "沒有存進 Supabase。");
        return;
      }
      const id = body && typeof body === "object" ? (body as { id?: unknown }).id : null;
      if (typeof id === "string") setLetterId(id);
      await loadList(setLetters, setListError);
    } catch {
      setError("沒有存進 Supabase。");
    } finally {
      setSaving(false);
    }
  }

  async function openLetter(id: string) {
    setError("");
    const response = await fetch(`/api/letters/${id}`);
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok || !body || typeof body !== "object") {
      setError(readError(body) ?? "讀不到這封信。");
      return;
    }
    const stored = (body as { letter?: unknown }).letter;
    if (!isStored(stored)) {
      setError("這封信的資料不完整。");
      return;
    }
    setLetterId(stored.id);
    setResume(stored.resume);
    setJobDescription(stored.jobDescription);
    setCompany(stored.company);
    setRole(stored.role);
    setHiringManager(stored.hiringManager);
    setTone(stored.tone);
    setLength(stored.length);
    setLanguage(stored.language);
    setFormat(stored.format);
    setProvider(stored.provider);
    setWrittenWith(stored.provider);
    setSubject(stored.subject);
    setLetter(stored.letter);
    setEmailBody(stored.email);
    setResult(
      stored.letter || stored.email
        ? {
            mode: stored.mode,
            subject: stored.subject,
            letter: stored.letter,
            email: stored.email,
            usedFacts: stored.usedFacts,
            omissions: stored.omissions,
            notice: stored.notice,
          }
        : null,
    );
    setPane(stored.letter ? "letter" : "email");
  }

  async function deleteLetter(id: string) {
    if (!window.confirm("從 Supabase 刪掉這封信？")) return;
    const response = await fetch(`/api/letters/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      setError(readError(body) ?? "沒有刪掉。");
      return;
    }
    if (letterId === id) startNew();
    await loadList(setLetters, setListError);
  }

  function startNew() {
    setLetterId(null);
    setResume("");
    setJobDescription("");
    setCompany("");
    setRole("");
    setHiringManager("");
    setResult(null);
    setLetter("");
    setEmailBody("");
    setSubject("");
    setFileNote("");
    setError("");
  }

  function loadSample() {
    setResume(SAMPLE_RESUME);
    setJobDescription(SAMPLE_JOB);
    setCompany(SAMPLE_COMPANY);
    setRole(SAMPLE_ROLE);
    setHiringManager("");
    setLanguage("en");
    setFormat("both");
    setFileNote("已載入虛構範例。Chloe Chan 不是真人。按下儲存或撰寫才會寫進 Supabase。");
    setError("");
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

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.refresh();
  }

  const showLetter = Boolean(letter);
  const showEmail = Boolean(emailBody);
  const activePane: Pane = showLetter && showEmail ? pane : showEmail ? "email" : "letter";
  const activeText = activePane === "email" ? emailWithSubject(subject, emailBody, language) : letter;

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/80">
        <div className="mx-auto flex max-w-[1760px] flex-col gap-4 px-4 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6 xl:px-8">
          <div className="flex items-start gap-3">
            <div
              aria-hidden
              className="grid size-11 shrink-0 place-items-center rounded-md bg-primary font-serif text-xl text-primary-foreground"
            >
              函
            </div>
            <div>
              <h1 className="font-serif text-3xl leading-none tracking-tight">函箋</h1>
            </div>
          </div>
          <div className="text-sm sm:text-right">
            <p className="font-medium">{email}</p>
            <p className="text-muted-foreground">
              <Link href="/settings" className="underline-offset-4 hover:underline">
                設定
              </Link>
              <span aria-hidden> · </span>
              <button type="button" className="underline-offset-4 hover:underline" onClick={() => void logout()}>
                登出
              </button>
            </p>
            {keyWarning ? <p className="mt-1 text-xs text-destructive">{keyWarning}</p> : null}
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full min-w-0 max-w-[1760px] items-start gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_minmax(0,1fr)] xl:gap-8 xl:px-8">
        <aside className="grid min-w-0 gap-2 overflow-hidden">
          <Button type="button" variant="outline" className="w-full min-w-0 max-w-full" onClick={startNew}>
            新的一封
          </Button>
          {listError ? <p className="text-xs text-destructive">{listError}</p> : null}
          <ul className="grid min-w-0 gap-1">
            {letters.length === 0 ? (
              <li className="px-1 text-sm text-muted-foreground">存進 Supabase 的信會列在這裡。</li>
            ) : null}
            {letters.map((item) => (
              <li key={item.id} className="flex min-w-0 items-start gap-1">
                <button
                  type="button"
                  className={cn(
                    "min-w-0 flex-1 overflow-hidden rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted",
                    item.id === letterId && "bg-muted",
                  )}
                  onClick={() => void openLetter(item.id)}
                >
                  <span className="block truncate font-medium">{item.role || item.subject || "未命名"}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {item.company ? `${item.company} · ` : ""}
                    {hongKongTime.format(new Date(item.updatedAt))}
                  </span>
                </button>
                <Button type="button" variant="ghost" size="icon" onClick={() => void deleteLetter(item.id)} aria-label="刪除">
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        </aside>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="font-serif text-xl">材料</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="@container grid min-w-0 gap-4" onSubmit={onSubmit}>
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
                  className="field-sizing-fixed min-h-52 w-full max-w-full resize-y"
                />
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf,.docx,.txt,.md,application/pdf,text/plain"
                    className="sr-only"
                    onChange={(event) => void onFile(event.target.files?.[0])}
                  />
                  <Button type="button" variant="outline" disabled={reading} onClick={() => fileRef.current?.click()}>
                    <FileUp />
                    {reading ? "讀取中" : "上傳履歷"}
                  </Button>
                  <Button type="button" variant="outline" onClick={loadSample}>
                    載入範例
                  </Button>
                  <Button type="button" variant="ghost" onClick={startNew}>
                    清除
                  </Button>
                </div>
                {fileNote ? <p className="text-xs text-muted-foreground">{fileNote}</p> : null}
              </div>

              <JobSearch
                onPick={(job) => {
                  setCompany(job.company.slice(0, 120));
                  setRole(job.title.slice(0, 120));
                  setJobDescription(job.text.slice(0, 20_000));
                  setError("");
                }}
              />

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
                  className="field-sizing-fixed min-h-40 w-full max-w-full resize-y"
                />
              </div>

              <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                <div className="grid min-w-0 gap-1.5">
                  <Label htmlFor="company">公司</Label>
                  <Input id="company" value={company} maxLength={120} onChange={(event) => setCompany(event.target.value)} placeholder="可不填" />
                </div>
                <div className="grid min-w-0 gap-1.5">
                  <Label htmlFor="role">職位</Label>
                  <Input id="role" value={role} maxLength={120} onChange={(event) => setRole(event.target.value)} placeholder="可不填" />
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
              <div className="grid min-w-0 gap-3 sm:grid-cols-2 @min-[36rem]:grid-cols-3">
                <Choice label="模型" value={provider} items={providerItems} onChange={setProvider} />
                <Choice label="語氣" value={tone} items={TONE_ITEMS} onChange={setTone} />
                <Choice label="篇幅" value={length} items={LENGTH_ITEMS} onChange={setLength} />
                <Choice label="語言" value={language} items={LANGUAGE_ITEMS} onChange={setLanguage} />
                <Choice label="產出" value={format} items={FORMAT_ITEMS} onChange={setFormat} />
              </div>
              {error ? (
                <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button type="submit" size="lg" className="h-10" disabled={loading}>
                  <PenLine />
                  {loading ? "正在對照履歷與職缺" : "撰寫並儲存"}
                </Button>
                <Button type="button" variant="outline" className="h-10" disabled={saving} onClick={() => void saveCurrent()}>
                  {saving ? "儲存中" : "只儲存"}
                </Button>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                {provider === "grok"
                  ? "履歷、職缺和文稿寫進 Supabase。選 Grok 時，這次內容會送給 xAI。"
                  : "履歷、職缺和文稿寫進 Supabase。選 Gemini 時，這次內容會送給 Google。"}
              </p>
            </form>
          </CardContent>
        </Card>

        <section ref={resultRef} aria-live="polite" className="min-w-0">
          <Card className="min-w-0 lg:sticky lg:top-4">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="font-serif text-xl">文稿</CardTitle>
                {result ? (
                  <Badge variant={result.mode === "model" ? "default" : "secondary"}>
                    {result.mode === "model" ? (writtenWith === "grok" ? "Grok" : "Gemini") : "結構草稿"}
                  </Badge>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="grid gap-4">
              {!result && !loading ? (
                <div className="letter-sheet rounded-lg px-5 py-8">
                  <p className="font-serif text-2xl">信會寫在這裡。</p>
                  <ol className="mt-4 grid list-decimal gap-2 pl-4 text-sm leading-6 text-muted-foreground">
                    <li>貼上履歷，或先載入虛構範例。</li>
                    <li>貼上職缺，或從 JobsDB 搜尋，再選擇 Grok 或 Gemini。</li>
                    <li>撰寫後可以改字，再儲存、複製或下載。內容在 Supabase。</li>
                  </ol>
                </div>
              ) : null}
              {loading ? <p className="rounded-lg bg-muted px-4 py-8 text-sm">正在對照履歷與職缺，撰寫中。</p> : null}
              {result ? (
                <>
                  {result.notice ? (
                    <p className="rounded-lg bg-accent px-3 py-2 text-sm leading-6 text-accent-foreground">{result.notice}</p>
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
                        <LetterField id="letter" value={letter} language={language} onChange={setLetter} />
                      </TabsContent>
                      <TabsContent value="email" className="pt-3">
                        <LetterField id="email" value={emailBody} language={language} onChange={setEmailBody} />
                      </TabsContent>
                    </Tabs>
                  ) : showLetter ? (
                    <LetterField id="letter" value={letter} language={language} onChange={setLetter} />
                  ) : (
                    <LetterField id="email" value={emailBody} language={language} onChange={setEmailBody} />
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
                        download(activePane === "email" ? "application-email.txt" : "cover-letter.txt", activeText)
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

async function loadList(
  setLetters: (letters: Summary[]) => void,
  setListError: (message: string) => void,
) {
  try {
    const response = await fetch("/api/letters");
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      setListError(readError(body) ?? "讀不到已存的信。");
      return;
    }
    const letters = body && typeof body === "object" ? (body as { letters?: unknown }).letters : null;
    setLetters(Array.isArray(letters) ? letters.filter(isSummary) : []);
    setListError("");
  } catch {
    setListError("讀不到已存的信。");
  }
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
        className="letter-sheet field-sizing-fixed min-h-[28rem] w-full max-w-full resize-y px-4 py-4 font-serif text-base leading-7 md:text-base"
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
    <div className="grid min-w-0 gap-1.5">
      <Label>{label}</Label>
      <Select
        value={value}
        items={items}
        onValueChange={(next) => {
          if (typeof next === "string" && next in items) onChange(next as T);
        }}
      >
        <SelectTrigger className="w-full min-w-0 max-w-full">
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

function isSummary(value: unknown): value is Summary {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === "string" && typeof record.updatedAt === "string";
}

function isStored(value: unknown): value is Stored {
  if (!isSummary(value) || !value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.resume === "string" && typeof record.jobDescription === "string" && typeof record.letter === "string";
}

function isDraftResponse(
  value: unknown,
): value is DraftOutput & { id: string | null; saveError?: string; provider?: Provider } {
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
  if (language === "zh-Hant") return `${text.replace(/\s/g, "").length.toLocaleString("zh-Hant")} 字`;
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

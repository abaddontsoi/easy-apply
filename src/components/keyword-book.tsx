"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { keywordFromSelection, normalizeKeyword, splitMarks } from "@/lib/keywords";
import { cn } from "@/lib/utils";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";

type Keyword = { text: string; hits: number };

type Book = {
  keywords: Keyword[];
  add: (text: string) => Promise<string>;
};

const KeywordContext = createContext<Book | null>(null);

export function KeywordBook({ children }: { children: ReactNode }) {
  const [keywords, setKeywords] = useState<Keyword[]>([]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/keywords")
      .then((response) => response.json())
      .then((body: unknown) => {
        if (cancelled) return;
        setKeywords(readKeywords(body));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  async function add(text: string): Promise<string> {
    const response = await fetch("/api/keywords", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) return readError(body) ?? "這次沒有存成關鍵字。";
    const keyword = readKeyword(body);
    if (!keyword) return "這次沒有存成關鍵字。";
    setKeywords((current) => {
      const normalized = normalizeKeyword(keyword.text);
      if (current.some((item) => normalizeKeyword(item.text) === normalized)) return current;
      return [...current, keyword];
    });
    return "";
  }

  return <KeywordContext.Provider value={{ keywords, add }}>{children}</KeywordContext.Provider>;
}

export function KeywordArea({
  value,
  className,
  onMouseUp,
  onKeyUp,
  onScroll,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const book = useContext(KeywordContext);
  const mirror = useRef<HTMLDivElement>(null);
  const [popup, setPopup] = useState<Popup | null>(null);
  const keywords = book?.keywords.map((keyword) => keyword.text) ?? [];

  function showSelection(target: HTMLTextAreaElement, point?: { x: number; y: number }) {
    const selected = keywordFromSelection(target.value.slice(target.selectionStart, target.selectionEnd));
    if (!selected) {
      setPopup(null);
      return;
    }
    const rect = target.getBoundingClientRect();
    setPopup({
      text: selected,
      x: point?.x ?? rect.left + 12,
      y: point?.y ?? rect.top + 12,
    });
  }

  return (
    <div className="relative min-w-0">
      <div
        ref={mirror}
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg border border-transparent px-2.5 py-2 text-base break-words whitespace-pre-wrap md:text-sm"
      >
        <MarkedText text={value ?? ""} keywords={keywords} />
        {String(value ?? "").endsWith("\n") ? "\u200b" : null}
      </div>
      <Textarea
        {...props}
        value={value}
        onMouseUp={(event) => {
          showSelection(event.currentTarget, { x: event.clientX, y: event.clientY });
          onMouseUp?.(event);
        }}
        onKeyUp={(event) => {
          if (event.key === "Shift" || event.key.startsWith("Arrow")) showSelection(event.currentTarget);
          onKeyUp?.(event);
        }}
        onScroll={(event) => {
          if (mirror.current) mirror.current.scrollTop = event.currentTarget.scrollTop;
          onScroll?.(event);
        }}
        className={cn("relative z-10 bg-transparent text-transparent caret-foreground", className)}
      />
      {popup && book ? (
        <KeywordPopup
          popup={popup}
          saved={book.keywords.some((keyword) => normalizeKeyword(keyword.text) === normalizeKeyword(popup.text))}
          onAdd={book.add}
          onClose={() => setPopup(null)}
        />
      ) : null}
    </div>
  );
}

export function KeywordText({ text, className }: { text: string; className?: string }) {
  const book = useContext(KeywordContext);
  const root = useRef<HTMLDivElement>(null);
  const [popup, setPopup] = useState<Popup | null>(null);
  const keywords = book?.keywords.map((keyword) => keyword.text) ?? [];

  function showSelection(event: MouseEvent<HTMLDivElement>) {
    const selection = window.getSelection();
    const selected = keywordFromSelection(selection?.toString() ?? "");
    const node = selection?.anchorNode;
    if (!selected || !node || !root.current?.contains(node)) {
      setPopup(null);
      return;
    }
    setPopup({ text: selected, x: event.clientX, y: event.clientY });
  }

  return (
    <div ref={root} className={className} onMouseUp={showSelection}>
      <MarkedText text={text} keywords={keywords} />
      {popup && book ? (
        <KeywordPopup
          popup={popup}
          saved={book.keywords.some((keyword) => normalizeKeyword(keyword.text) === normalizeKeyword(popup.text))}
          onAdd={book.add}
          onClose={() => setPopup(null)}
        />
      ) : null}
    </div>
  );
}

function MarkedText({ text, keywords }: { text: string; keywords: string[] }) {
  return splitMarks(text, keywords).map((part, index) =>
    part.marked ? (
      <mark key={`${index}-${part.value}`} className="rounded-sm bg-primary/20 text-foreground">
        {part.value}
      </mark>
    ) : (
      <span key={`${index}-${part.value.slice(0, 12)}`}>{part.value}</span>
    ),
  );
}

type Popup = { text: string; x: number; y: number };

function KeywordPopup({
  popup,
  saved,
  onAdd,
  onClose,
}: {
  popup: Popup;
  saved: boolean;
  onAdd: (text: string) => Promise<string>;
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const left = Math.min(popup.x, Math.max(8, window.innerWidth - 160));
  const top = Math.min(popup.y + 8, Math.max(8, window.innerHeight - 48));

  useEffect(() => {
    function close(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-keyword-popup]")) return;
      onClose();
    }
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [onClose]);

  return (
    <div
      data-keyword-popup
      className="fixed z-50 grid gap-1 rounded-lg bg-popover p-1.5 shadow-md ring-1 ring-foreground/10"
      style={{ left, top }}
    >
      <Button
        type="button"
        size="sm"
        disabled={saved || pending}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          setPending(true);
          void onAdd(popup.text).then((message) => {
            setPending(false);
            if (message) {
              setError(message);
              return;
            }
            onClose();
          });
        }}
      >
        {pending ? "加入中" : saved ? "已記錄" : "加入關鍵字"}
      </Button>
      {error ? <p className="max-w-40 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function readKeywords(value: unknown): Keyword[] {
  if (!value || typeof value !== "object") return [];
  const keywords = (value as { keywords?: unknown }).keywords;
  if (!Array.isArray(keywords)) return [];
  return keywords
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const text = (item as { text?: unknown }).text;
      const hits = (item as { hits?: unknown }).hits;
      if (typeof text !== "string" || !text) return null;
      return { text, hits: typeof hits === "number" ? hits : 0 };
    })
    .filter((item): item is Keyword => item !== null);
}

function readKeyword(value: unknown): Keyword | null {
  if (!value || typeof value !== "object") return null;
  return readKeywords({ keywords: [(value as { keyword?: unknown }).keyword] })[0] ?? null;
}

function readError(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const error = (value as { error?: unknown }).error;
  return typeof error === "string" ? error : null;
}

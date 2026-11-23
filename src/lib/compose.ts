import type { DraftInput, DraftOutput, Language, Length, Tone } from "@/lib/draft";

const STOP = new Set(
  `a an the and or of to for in on with at from by as is are was were be been being this that those these your our their you we they it its not no nor per via into over under than then so such about across within without more most other any all each both using use used will can may must should have has had role roles job jobs team teams work working experience experienced required requirements requirement responsibilities responsibility skills skill ability abilities strong including include plus years year well good great high able who what when where how also just than between during after before into onto within across our your their them one two new`.split(
    /\s+/,
  ),
);

const HAN_STOP = new Set([
  "我們",
  "他們",
  "以及",
  "需要",
  "能夠",
  "相關",
  "以上",
  "以下",
  "一個",
  "這個",
  "負責",
  "經驗",
  "要求",
  "能力",
  "熟悉",
  "具備",
  "包括",
  "工作",
  "職位",
  "公司",
]);

const VERB =
  /^(led|managed|ran|built|cut|kept|coordinated|designed|shipped|owned|reduced|launched|wrote|created|supported|partnered|introduced|improved|delivered|established|trained|hired|analyzed|analysed|drove|grew|defined|scoped|planned|hosted|edited|reviewed|negotiated|migrated|automated|documented|measured|tracked|reported|presented|mentored|onboarded|implemented|deployed|maintained|researched|conducted|facilitated|organized|organised|prepared|produced|published|handled|resolved|investigated)\b/i;

const HEADING =
  /^(experience|education|skills|projects|summary|profile|work|employment|tools|certifications|awards|interests|references|經歷|學歷|技能|簡介|工作經歷|專案|工具)$/i;

const FACT_COUNT: Record<Length, number> = {
  email: 2,
  letter: 4,
  detailed: 6,
};

type Line = { index: number; text: string; score: number };

export function composeStructured(input: DraftInput): DraftOutput {
  const name = guessName(input.resume);
  const email = guessEmail(input.resume);
  const facts = selectFacts(input.resume, input.jobDescription, FACT_COUNT[input.length]);
  const emailFacts = [...facts]
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, Math.min(2, facts.length))
    .sort((a, b) => a.index - b.index);
  const omissions = findOmissions(input.resume, input.jobDescription);
  const factText = facts.map((fact) => fact.text).join(" ");
  const targetScript = input.language === "zh-Hant" ? "han" : "latin";
  const quoted = factText.length > 0 && scriptOf(factText) !== targetScript;
  const notice = noticeFor(input.language, quoted);

  const letter =
    input.format === "email"
      ? ""
      : renderPiece(input, facts, name, email, "letter");
  const emailBody =
    input.format === "letter"
      ? ""
      : renderPiece(input, emailFacts, name, email, "email");

  return {
    mode: "structured",
    subject: subjectLine(input),
    letter,
    email: emailBody,
    usedFacts: facts.map((fact) => fact.text),
    omissions,
    notice,
  };
}

function noticeFor(language: Language, quoted: boolean): string {
  const base =
    "這是結構草稿：句子來自履歷原文，沒有經過模型潤飾，也不會補上履歷裡沒有的成就。";
  if (!quoted) return base;
  return language === "zh-Hant"
    ? `${base}你選了繁體中文，履歷主要是另一種文字，草稿沒有翻譯。`
    : `${base}你選了英文，履歷主要是另一種文字，草稿沒有翻譯。`;
}

function renderPiece(
  input: DraftInput,
  facts: Line[],
  name: string,
  email: string,
  kind: "letter" | "email",
): string {
  const sentences = facts.map((fact) => asSentence(fact.text));
  const body =
    sentences.length > 0
      ? joinSentences(sentences, input.language, kind)
      : emptyBody(input.language);
  const blocks = [
    salutation(input),
    opening(input),
    body,
    closing(input.tone, input.language),
    signoff(input.language, name, email),
  ];
  return blocks.filter(Boolean).join("\n\n");
}

function salutation(input: DraftInput): string {
  if (input.language === "zh-Hant") {
    return input.hiringManager ? `${input.hiringManager}您好：` : "敬啟者：";
  }
  return `Dear ${input.hiringManager || "Hiring Manager"},`;
}

function opening(input: DraftInput): string {
  const role = rolePhrase(input);
  if (input.language === "zh-Hant") {
    const line: Record<Tone, string> = {
      professional: `我想應徵${role}。`,
      warm: `${role}是我想認真接的工作。`,
      confident: `我應徵${role}，下面是履歷裡對得上的經歷。`,
      direct: `我應徵${role}。`,
    };
    return line[input.tone];
  }
  const line: Record<Tone, string> = {
    professional: `I would like to be considered for the ${role}.`,
    warm: `The ${role} is work I would be glad to take on.`,
    confident: `I am applying for the ${role}. The notes below are why.`,
    direct: `I am applying for the ${role}.`,
  };
  return line[input.tone];
}

function rolePhrase(input: DraftInput): string {
  const { company, role, language } = input;
  if (language === "zh-Hant") {
    if (role && company) return `${company}的${role}一職`;
    if (role) return `${role}一職`;
    if (company) return `${company}這個職位`;
    return "貴公司這個職位";
  }
  if (role && company) return `${role} role at ${company}`;
  if (role) return `${role} role`;
  if (company) return `open role at ${company}`;
  return "open role in your posting";
}

function closing(tone: Tone, language: Language): string {
  if (language === "zh-Hant") {
    const line: Record<Tone, string> = {
      professional: "若方便，我可以說明這些經歷如何對上職位要求。",
      warm: "如果有幫助，我可以逐項說明上面的例子。",
      confident: "細節我可以在談話裡展開。",
      direct: "方便的話，我們可以直接談是否合適。",
    };
    return line[tone];
  }
  const line: Record<Tone, string> = {
    professional: "I would be glad to talk through how this fits the role.",
    warm: "If it is useful, I can walk through any of these examples.",
    confident: "I can walk through the details in a conversation.",
    direct: "Happy to discuss whether this is a fit.",
  };
  return line[tone];
}

function signoff(language: Language, name: string, email: string): string {
  const who = [name, email].filter(Boolean);
  if (language === "zh-Hant") {
    return ["此致", "敬禮", ...who].join("\n");
  }
  return ["Sincerely,", ...who].join("\n");
}

function emptyBody(language: Language): string {
  return language === "zh-Hant"
    ? "履歷裡還沒有對得上這份職缺的句子。補上近期工作的幾點，再撰寫一次。"
    : "The résumé does not yet have lines that line up with this posting. Add a few notes about recent work, then write it again.";
}

function joinSentences(sentences: string[], language: Language, kind: "letter" | "email"): string {
  const intro =
    language === "zh-Hant" ? "履歷裡對得上的幾點：" : "From the résumé:";
  if (kind === "email" || sentences.length <= 3) {
    return `${intro}\n${sentences.join("\n")}`;
  }
  const mid = Math.ceil(sentences.length / 2);
  return `${intro}\n${sentences.slice(0, mid).join("\n")}\n\n${sentences.slice(mid).join("\n")}`;
}

function subjectLine(input: DraftInput): string {
  if (input.language === "zh-Hant") {
    const role = input.role || "貴公司職位";
    return input.company ? `應徵${role}｜${input.company}` : `應徵${role}`;
  }
  const role = input.role || "the open role";
  return input.company ? `Application for ${role} — ${input.company}` : `Application for ${role}`;
}

function selectFacts(resume: string, job: string, count: number): Line[] {
  const requirements = requirementLines(job).join("\n");
  const needles = distinctive(requirements || job);
  const lines = resume
    .split(/\r?\n/)
    .map((raw) => raw.trim())
    .filter((text) => text && !text.includes("@") && !HEADING.test(text) && text.length >= 20)
    .map((text) => ({
      index: 0,
      text: text.replace(/^[-*•–]\s*/, "").replace(/^\d+[.)]\s*/, ""),
      score: overlap(text, needles),
    }));
  lines.forEach((line, index) => {
    line.index = index;
  });
  const ranked = [...lines].sort((a, b) => b.score - a.score || a.index - b.index);
  const matched = ranked.filter((line) => line.score > 0);
  const pool = matched.length > 0 ? matched : ranked.filter((line) => line.text.length >= 40);
  return pool.slice(0, count).sort((a, b) => a.index - b.index);
}

function requirementLines(job: string): string[] {
  return job
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 12 && line.length <= 220)
    .filter(
      (line) =>
        /^[-*•–]/.test(line) ||
        /^\d+[.)]/.test(line) ||
        /(required|must|familiar|proficient|qualificat|熟悉|負責|要求)/i.test(line),
    );
}

function findOmissions(resume: string, job: string): string[] {
  const haystack = resume.toLowerCase();
  const lines = requirementLines(job);
  const gaps: string[] = [];
  for (const line of lines) {
    const keys = distinctive(line);
    if (keys.length === 0) continue;
    const hits = keys.filter((key) => haystack.includes(key.toLowerCase())).length;
    if (hits / keys.length < 0.34) {
      gaps.push(line.replace(/^[-*•–]\s*/, "").replace(/^\d+[.)]\s*/, "").slice(0, 180));
    }
    if (gaps.length === 5) break;
  }
  return gaps;
}

function asSentence(line: string): string {
  let text = line.trim();
  if (!text) return text;
  const han = (text.match(/[\p{Script=Han}]/gu) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  if (latin >= han && VERB.test(text) && !/^i\b/i.test(text)) {
    text = `I ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
  }
  if (!/[.!?。！？]$/.test(text)) {
    text += han > latin ? "。" : ".";
  }
  return text;
}

function distinctive(text: string): string[] {
  const latin = (text.toLowerCase().match(/[a-z][a-z0-9+.#-]{2,}/g) ?? []).filter(
    (token) => !STOP.has(token),
  );
  const han = (text.match(/[\p{Script=Han}]{2,8}/gu) ?? []).filter((token) => !HAN_STOP.has(token));
  return [...new Set([...latin, ...han])];
}

function overlap(text: string, needles: string[]): number {
  const haystack = text.toLowerCase();
  let score = 0;
  for (const needle of needles) {
    if (haystack.includes(needle.toLowerCase())) score += 1;
  }
  return score;
}

function guessName(resume: string): string {
  const lines = resume
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 6);
  for (const line of lines) {
    if (line.includes("@") || /\d{3,}/.test(line) || line.length > 48) continue;
    if (/^(resume|curriculum|cv|履歷|簡介)/i.test(line)) continue;
    if (/^[\p{Script=Han}]{2,4}$/u.test(line)) return line;
    if (/^[\p{L}][\p{L} .'-]{1,46}$/u.test(line) && line.split(/\s+/).length >= 2) return line;
  }
  return "";
}

function guessEmail(resume: string): string {
  return resume.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? "";
}

function scriptOf(text: string): "han" | "latin" {
  const han = (text.match(/[\p{Script=Han}]/gu) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  return han > latin ? "han" : "latin";
}

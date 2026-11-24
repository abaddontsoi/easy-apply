const STORAGE_KEY = "easy-apply.selected-job";

export type SelectedJob = {
  company: string;
  role: string;
  text: string;
};

let pending: SelectedJob | null = null;

export function storeSelectedJob(job: SelectedJob): void {
  pending = {
    company: job.company.slice(0, 120),
    role: job.role.slice(0, 120),
    text: job.text.slice(0, 20_000),
  };
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
  } catch {
    // The in-memory copy still carries the selection to the next page.
  }
}

export function peekSelectedJob(): SelectedJob | null {
  if (pending) return pending;
  try {
    pending = parseSelectedJob(sessionStorage.getItem(STORAGE_KEY));
  } catch {
    pending = null;
  }
  return pending;
}

export function clearSelectedJob(): void {
  pending = null;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // The in-memory copy is already cleared.
  }
}

export function parseSelectedJob(raw: string | null): SelectedJob | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.company !== "string" || typeof record.role !== "string" || typeof record.text !== "string") {
    return null;
  }
  if (!record.text.trim()) return null;
  return {
    company: record.company.slice(0, 120),
    role: record.role.slice(0, 120),
    text: record.text.slice(0, 20_000),
  };
}

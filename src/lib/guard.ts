const WINDOW_MS = 10 * 60 * 1000;
const MAX_WRITES = 8;

const writes = new Map<string, number[]>();

export function allowWrite(viewerKey: string): boolean {
  const now = Date.now();
  const recent = (writes.get(viewerKey) ?? []).filter((stamp) => now - stamp < WINDOW_MS);
  if (recent.length >= MAX_WRITES) {
    writes.set(viewerKey, recent);
    return false;
  }
  recent.push(now);
  writes.set(viewerKey, recent);
  return true;
}

export function resetWritesForTests(): void {
  writes.clear();
}

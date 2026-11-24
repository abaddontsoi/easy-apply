const WINDOW_MS = 10 * 60 * 1000;
const MAX_WRITES = 8;
const MAX_SCRAPES = 3;

const writes = new Map<string, number[]>();
const scrapes = new Map<string, number[]>();

export function allowWrite(viewerKey: string): boolean {
  return takeSlot(writes, viewerKey, MAX_WRITES);
}

export function allowScrape(viewerKey: string): boolean {
  return takeSlot(scrapes, viewerKey, MAX_SCRAPES);
}

export function resetWritesForTests(): void {
  writes.clear();
  scrapes.clear();
}

function takeSlot(bucket: Map<string, number[]>, viewerKey: string, max: number): boolean {
  const now = Date.now();
  const recent = (bucket.get(viewerKey) ?? []).filter((stamp) => now - stamp < WINDOW_MS);
  if (recent.length >= max) {
    bucket.set(viewerKey, recent);
    return false;
  }
  recent.push(now);
  bucket.set(viewerKey, recent);
  return true;
}

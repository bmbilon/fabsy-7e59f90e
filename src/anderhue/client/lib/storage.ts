// Storage that never throws: private browsing, blocked cookies and full
// quotas all degrade to "nothing stored" instead of breaking the page.

type Kind = 'session' | 'local';

function store(kind: Kind): Storage | null {
  try {
    return kind === 'session' ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

export function readItem(kind: Kind, key: string): string | null {
  try {
    return store(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeItem(kind: Kind, key: string, value: string): void {
  try {
    store(kind)?.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

export function removeItem(kind: Kind, key: string): void {
  try {
    store(kind)?.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}

export function readJson<T>(kind: Kind, key: string): T | null {
  const raw = readItem(kind, key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeJson(kind: Kind, key: string, value: unknown): void {
  try {
    writeItem(kind, key, JSON.stringify(value));
  } catch {
    /* not serialisable */
  }
}

export const FUNNEL_SESSION_STORAGE_KEY = 'fabsy:funnel-session:v1';
export const FUNNEL_EVENT_DEDUPE_PREFIX = 'fabsy:funnel-event:v1:';

/**
 * Retire the anonymous journey identifier and all per-event dedupe markers
 * whenever first-party funnel consent is withdrawn, expires, or disappears in
 * another tab. A later grant must begin a new anonymous measurement journey.
 */
export function clearFunnelSessionState(
  storage: Pick<Storage, 'length' | 'key' | 'removeItem'>,
): void {
  try {
    storage.removeItem(FUNNEL_SESSION_STORAGE_KEY);
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(FUNNEL_EVENT_DEDUPE_PREFIX)) keys.push(key);
    }
    for (const key of keys) storage.removeItem(key);
  } catch {
    // Storage denial already prevents a durable session or dedupe marker.
  }
}

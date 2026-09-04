export const CLICK_ID_KEYS = ['gclid', 'gbraid', 'wbraid', 'fbclid'] as const;
export const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const;

export type ClickIdKey = (typeof CLICK_ID_KEYS)[number];
export type UtmKey = (typeof UTM_KEYS)[number];

const CLICK_ID_PATTERN = /^[A-Za-z0-9_-]{1,512}$/;
const UTM_VALUE_PATTERN = /^[A-Za-z0-9._~-]{1,250}$/;

export function validClickId(value: string): boolean {
  return CLICK_ID_PATTERN.test(value) && !/\s/.test(value);
}

export function validUtmValue(value: string): boolean {
  return UTM_VALUE_PATTERN.test(value) && !/\s/.test(value);
}

export function uniqueSafeSearchValues(
  url: URL,
  allowedKeys: ReadonlySet<string>,
): Map<string, string> | null {
  const values = new Map<string, string>();
  for (const [key, value] of url.searchParams) {
    if (!allowedKeys.has(key) || values.has(key)) return null;
    const valid = (CLICK_ID_KEYS as readonly string[]).includes(key)
      ? validClickId(value)
      : (UTM_KEYS as readonly string[]).includes(key) && validUtmValue(value);
    if (!valid) return null;
    values.set(key, value);
  }
  return values;
}

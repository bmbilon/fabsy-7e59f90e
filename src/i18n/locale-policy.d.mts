export type LocaleCode = 'en' | 'pa' | 'tl' | 'zh-hans' | 'zh-hant' | 'ar' | 'hi' | 'es';
export const WAVE_ONE_LOCALES: readonly LocaleCode[];
export const LEGAL_SOURCE_DOCUMENT_PATHS: readonly string[];
export function fingerprint(value: unknown): string;
export function normalizeLocale(value: unknown): LocaleCode | null;
export function splitLocalePath(pathname: string): { locale: LocaleCode; path: string; hasLocalePrefix: boolean };
export function localizePath(value: string, locale: string): string;
export function isLocaleReleased(code: string, review: unknown, expected: { sourceVersion: string; sourceFingerprint: string; bundleFingerprint: string; sourceDocuments: Record<string, string> }): boolean;
export function preferredLocale(preferences: string | readonly string[], available?: readonly string[]): LocaleCode | null;

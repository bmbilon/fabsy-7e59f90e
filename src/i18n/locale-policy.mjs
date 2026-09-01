/** Shared browser/build policy. Fingerprints detect editing drift, not authenticity. */
export const WAVE_ONE_LOCALES = Object.freeze(['en', 'pa', 'tl', 'zh-hans', 'zh-hant', 'ar', 'hi', 'es']);
export const EDITORIAL_RETURN_STATE_KEY = 'fabsyEditorialReturnPath';
const SAFE_EDITORIAL_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const LEGAL_SOURCE_DOCUMENT_PATHS = Object.freeze([
  'src/pages/TermsOfService.tsx',
  'src/pages/TermsOfPurchase.tsx',
  'src/components/form-steps/ConsentStep.tsx',
  'src/pages/PrivacyPolicy.tsx',
  'src/config/pro-drivers.ts',
  'src/config/offers.ts',
  'src/config/feeRefund.json',
  'supabase/functions/_shared/consent-pdf.ts',
]);

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function fingerprint(value) {
  const input = stableJson(value);
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function normalizeLocale(value) {
  if (typeof value !== 'string') return null;
  const tag = value.trim().toLowerCase().replaceAll('_', '-');
  if (/^zh-(?:hant|tw|hk|mo)(?:-|$)/.test(tag) || /^yue(?:-|$)/.test(tag)) return 'zh-hant';
  if (/^zh(?:-|$)/.test(tag) || /^cmn(?:-|$)/.test(tag)) return 'zh-hans';
  if (/^(?:fil|tl)(?:-|$)/.test(tag)) return 'tl';
  // Punjabi Pakistan uses a different script: do not offer Gurmukhi for Shahmukhi.
  if (/^pa-(?:arab|pk)(?:-|$)/.test(tag)) return null;
  const language = tag.split('-')[0];
  return WAVE_ONE_LOCALES.includes(language) ? language : null;
}

export function splitLocalePath(pathname) {
  // Browsers interpret leading // and backslashes as an external authority in
  // links. Normalize before and after removing a locale prefix.
  const path = `/${pathname.replaceAll('\\', '/').replace(/^\/+/, '')}`.replace(/\/{2,}/g, '/');
  const [first, ...rest] = path.slice(1).split('/');
  const hasLocalePrefix = first !== 'en' && WAVE_ONE_LOCALES.includes(first);
  const base = hasLocalePrefix ? `/${rest.join('/')}` : path;
  return { locale: hasLocalePrefix ? first : 'en', path: base.replace(/\/+$/, '') || '/', hasLocalePrefix };
}

export function localizePath(value, locale) {
  if (value.startsWith('//') || value.startsWith('\\')) return '/';
  if (!value.startsWith('/')) return value;
  const suffixAt = value.search(/[?#]/);
  const pathname = suffixAt < 0 ? value : value.slice(0, suffixAt);
  const suffix = suffixAt < 0 ? '' : value.slice(suffixAt);
  const { path } = splitLocalePath(pathname);
  const code = WAVE_ONE_LOCALES.includes(locale) ? locale : 'en';
  return `${code === 'en' ? path : `/${code}${path === '/' ? '/' : path}`}${suffix}`;
}

/** English-only editorial routes that may be carried through a language handoff. */
export function englishEditorialReturnPath(value) {
  if (typeof value !== 'string' || value.length > 240) return null;
  const clean = value.replace(/\/+$/, '') || '/';
  const parts = clean.split('/');
  const safeSlug = slug => typeof slug === 'string' && slug.length <= 180 && SAFE_EDITORIAL_SLUG.test(slug);
  if (clean === '/blog') return clean;
  if (parts.length === 3 && parts[1] === 'blog' && safeSlug(parts[2])) return clean;
  if (parts.length === 3 && parts[1] === 'content' && safeSlug(parts[2])) return clean;
  return null;
}

export function editorialReturnPathFromState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
  return englishEditorialReturnPath(state[EDITORIAL_RETURN_STATE_KEY]);
}

/** Returns a route only for the English-editorial/localized-home handoff. */
export function editorialLanguageHandoffDestination(nextLocale, basePath, pathname, state) {
  const editorialPath = englishEditorialReturnPath(pathname);
  if (nextLocale !== 'en' && WAVE_ONE_LOCALES.includes(nextLocale) && editorialPath) {
    return {
      path: localizePath('/', nextLocale),
      state: { [EDITORIAL_RETURN_STATE_KEY]: editorialPath },
    };
  }
  const returnPath = basePath === '/' ? editorialReturnPathFromState(state) : null;
  return nextLocale === 'en' && returnPath ? { path: returnPath, state: null } : null;
}

function localeReleaseChecks(code, review, expected) {
  if (code === 'en') return true;
  if (!WAVE_ONE_LOCALES.includes(code)) return false;
  const entry = review?.locales?.[code];
  const sourceDocuments = expected?.sourceDocuments;
  const legalSourcesMatch = sourceDocuments && LEGAL_SOURCE_DOCUMENT_PATHS.every(file =>
    typeof sourceDocuments[file] === 'string' && sourceDocuments[file] && entry?.sourceDocuments?.[file] === sourceDocuments[file],
  );
  const reviewedRelease = entry?.status === 'approved' &&
    typeof entry.reviewedBy === 'string' && entry.reviewedBy.trim() &&
    typeof entry.reviewedAt === 'string' && Number.isFinite(Date.parse(entry.reviewedAt)) &&
    entry.serviceReady === true;
  // Publication is a separate owner decision, not evidence of native review or
  // staffed language support. Both release paths bind the exact published copy.
  const publication = entry?.publication;
  const ownerPublication = entry?.status === 'published' &&
    publication?.basis === 'owner_authorized_machine_translation' &&
    typeof publication.authorizedBy === 'string' && publication.authorizedBy.trim() &&
    typeof publication.authorizedAt === 'string' && Number.isFinite(Date.parse(publication.authorizedAt));
  const currentCopy = Boolean(
    legalSourcesMatch &&
    review.sourceVersion === expected?.sourceVersion &&
    typeof expected?.sourceFingerprint === 'string' && expected.sourceFingerprint &&
    typeof expected?.bundleFingerprint === 'string' && expected.bundleFingerprint &&
    entry.sourceFingerprint === expected.sourceFingerprint &&
    entry.bundleFingerprint === expected.bundleFingerprint,
  );
  return { reviewedRelease: Boolean(reviewedRelease), ownerPublication: Boolean(ownerPublication), currentCopy };
}

/** A released locale is usable in the language selector and localized journey. */
export function isLocaleReleased(code, review, expected) {
  const checks = localeReleaseChecks(code, review, expected);
  if (checks === true || checks === false) return checks;
  return checks.currentCopy && (checks.reviewedRelease || checks.ownerPublication);
}

/** Only current-copy translations with a recorded human approval may be indexed. */
export function isLocaleIndexable(code, review, expected) {
  const checks = localeReleaseChecks(code, review, expected);
  if (checks === true || checks === false) return checks;
  return checks.currentCopy && checks.reviewedRelease;
}

/** Accept-Language header or navigator.languages, ordered by preference. */
export function preferredLocale(preferences, available = WAVE_ONE_LOCALES) {
  const candidates = Array.isArray(preferences) ? preferences : String(preferences || '').split(',')
    .map((entry, index) => {
      const [tag, ...parameters] = entry.trim().split(';');
      const quality = parameters.find(parameter => parameter.trim().startsWith('q='));
      return { tag, index, q: quality ? Number(quality.trim().slice(2)) : 1 };
    })
    .filter(entry => Number.isFinite(entry.q) && entry.q > 0 && entry.q <= 1)
    .sort((a, b) => b.q - a.q || a.index - b.index)
    .map(entry => entry.tag);
  for (const candidate of candidates) {
    const locale = normalizeLocale(candidate);
    if (locale && available.includes(locale)) return locale;
  }
  return null;
}

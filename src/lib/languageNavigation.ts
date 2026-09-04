export function languageNavigationSuffix(search: string, hash: string): string {
  const safeHash = /^#resume=[0-9a-f]{64}$/i.test(hash) ? '' : hash;
  return `${search}${safeHash}`;
}

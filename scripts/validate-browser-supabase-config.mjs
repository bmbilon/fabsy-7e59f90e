import { pathToFileURL } from 'node:url';
import { loadEnv } from 'vite';
import { validateBrowserSupabaseConfig } from './browser-supabase-config-policy.mjs';

export function run(environment = process.env) {
  try {
    const fileEnvironment = environment.VALIDATE_BROWSER_SUPABASE_SKIP_DOTENV === '1'
      ? {}
      : loadEnv(environment.VITE_MODE || 'production', process.cwd(), '');
    // Explicit process environment always wins over local Vite files, matching
    // the value Vite embeds in CI and authorized production builds.
    const result = validateBrowserSupabaseConfig({ ...fileEnvironment, ...environment });
    console.log(result.mode === 'configured'
      ? `Browser Supabase configuration verified for project ${result.projectRef}.`
      : 'Browser Supabase configuration absent; inert non-deployment build permitted.');
    return 0;
  } catch (error) {
    console.error(`Browser Supabase configuration rejected: ${error instanceof Error ? error.message : 'unknown validation error'}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = run();
}

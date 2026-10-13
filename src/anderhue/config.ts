/** Static practice identity for anderhue.ca. Backend values live in ltb_practices. */
export const ANDERHUE_PRACTICE = {
  practiceId: (import.meta.env.VITE_ANDERHUE_PRACTICE_ID as string | undefined) || 'anderhue-paralegal',
  name: 'AnderHue Paralegal',
  legalName: 'AnderHue Paralegal Professional Corporation',
  licensee: 'Don Anderson',
  phoneDisplay: '(289) 985-0166',
  phoneHref: 'tel:+12899850166',
  publicEmail: 'hello@anderhue.ca',
  hours: 'Mon–Fri, 9–5',
  siteUrl: 'https://anderhue.ca',
} as const;

export const SUPABASE_URL = ((import.meta.env.VITE_SUPABASE_URL as string | undefined) || '').replace(/\/$/, '');
export const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) || '';
export const functionUrl = (name: string) => `${SUPABASE_URL}/functions/v1/${name}`;

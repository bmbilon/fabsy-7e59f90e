import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ?? "https://gcasbisxfrssonllpqrw.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdjYXNiaXN4ZnJzc29ubGxwcXJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg1NDg5OTMsImV4cCI6MjA3NDEyNDk5M30.iWXMMWmnRuPQYVJCwAbUp0FiYxZWhe_bdyZycZYqBK8";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { storage: localStorage, persistSession: true, autoRefreshToken: true },
});

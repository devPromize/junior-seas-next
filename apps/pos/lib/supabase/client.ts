import { createBrowserClient } from '@supabase/ssr';

// Supabase client for the browser. The POS only ever calls the public.pos_* database
// functions; it never reads the POS tables directly.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

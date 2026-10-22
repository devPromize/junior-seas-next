import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { Me } from '@/lib/pos';

// The signed-in staff member, fetched once per request however many layouts and pages ask.
// error is set when they're signed in but not staff (e.g. a website customer account).
export const getMe = cache(async (): Promise<{ me: Me | null; error: string | null }> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('pos_me');
  if (error) return { me: null, error: error.message };
  return { me: data as Me, error: null };
});

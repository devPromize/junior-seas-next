import { NextResponse } from 'next/server';
import { createClient } from '@/lib/services/server';

/**
 * Identifies the logged-in user via the cookie-bound SSR client and returns that
 * client for follow-up queries (so RLS applies as the user). On failure, `error`
 * holds a 401 response and `user` is null.
 *
 *   const { error, user, supabase } = await requireUser();
 *   if (error) return error;
 */
export async function requireUser() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
      user: null,
      supabase,
    };
  }

  return { error: null, user, supabase };
}

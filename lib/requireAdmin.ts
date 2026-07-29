import { NextResponse } from 'next/server';
import { createClient } from '@/lib/services/server';

/**
 * Server-side admin gate for API routes.
 *
 * Identifies the caller via the cookie-bound SSR client (respects the logged-in
 * session), then verifies `profiles.is_admin`. Returns a ready-to-return
 * NextResponse in `error` on failure; on success `error` is null and `user` is set.
 *
 * NOTE: do NOT use the service-role client (supabaseServer) to identify the user —
 * it has no cookie session, so `auth.getUser()` there never resolves the caller.
 * Use this to gate, then use supabaseServer for the privileged work.
 *
 *   const { error, user } = await requireAdmin();
 *   if (error) return error;
 */
export async function requireAdmin() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
      user: null,
    };
  }

  // A user may read their own profile row (RLS: "Select own profile"),
  // so this reads is_admin as the logged-in user.
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_admin) {
    return {
      error: NextResponse.json({ message: 'Forbidden' }, { status: 403 }),
      user: null,
    };
  }

  return { error: null, user };
}

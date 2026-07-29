// app/auth/confirm/route.ts
//
// Handles one-time email links (password recovery, signup confirmation). The
// email template points here with a token_hash; we verify it server-side (which
// sets the session cookie) and redirect the user on to `next`.
import { type NextRequest, NextResponse } from 'next/server';
import { type EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/services/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = searchParams.get('next') ?? '/account';

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  return NextResponse.redirect(
    new URL('/auth/login?error=invalid_or_expired_link', origin)
  );
}

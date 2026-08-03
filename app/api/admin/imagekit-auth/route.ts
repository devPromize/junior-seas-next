import { NextResponse } from 'next/server';
import imagekit from '@/lib/imagekit';
import { requireAdmin } from '@/lib/requireAdmin';

// GET /api/admin/imagekit-auth — returns short-lived upload credentials
// (token/expire/signature) signed with the private key. Admin-only, so only
// the admin panel can request an upload signature.
export async function GET() {
  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  const auth = imagekit.getAuthenticationParameters();
  return NextResponse.json(auth);
}

import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireAdmin } from '@/lib/requireAdmin';

// GET /api/admin/locations — active locations for the admin location switcher.
export async function GET() {
  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  const { data, error } = await supabaseServer
    .from('locations')
    .select('id, name, slug, city, is_active')
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  return NextResponse.json({ locations: data });
}

import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/requireUser';

export async function GET() {
  const { user, supabase } = await requireUser();
  if (!user) return NextResponse.json({ addresses: [] }, { status: 401 });

  const { data: addresses, error } = await supabase
    .from('addresses')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json(
      { addresses: [], error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ addresses });
}

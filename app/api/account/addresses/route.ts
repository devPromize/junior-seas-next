import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

export async function GET(req: Request) {
  const user = await supabaseServer.auth.getUser();

  if (!user.data.user) {
    return NextResponse.json({ addresses: [] }, { status: 401 });
  }

  const { data: addresses, error } = await supabaseServer
    .from('addresses')
    .select('*')
    .eq('user_id', user.data.user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ addresses: [], error: error.message }, { status: 500 });
  }

  return NextResponse.json({ addresses });
}

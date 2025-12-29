
import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

export async function GET() {
  const { data: { user } } = await supabaseServer.auth.getUser();

  if (!user) {
    return NextResponse.json({ profile: null }, { status: 401 });
  }

  const { data, error } = await supabaseServer
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  return NextResponse.json({
    profile: data ?? { email: user.email, full_name: '—', phone: '—' },
    error: error?.message
  });
}

export async function PATCH(req: Request) {
  const { data: { user } } = await supabaseServer.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { full_name, phone } = body;

  const { data, error } = await supabaseServer
    .from('profiles')
    .update({ full_name, phone })
    .eq('id', user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ profile: data });
}

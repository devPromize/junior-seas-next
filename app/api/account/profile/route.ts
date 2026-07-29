import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/requireUser';

export async function GET() {
  const { user, supabase } = await requireUser();
  if (!user) return NextResponse.json({ profile: null }, { status: 401 });

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  return NextResponse.json({
    profile: data ?? { email: user.email, full_name: '—', phone: '—' },
    error: error?.message,
  });
}

export async function PATCH(req: Request) {
  const { user, supabase } = await requireUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { full_name, phone } = body;

  const { data, error } = await supabase
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

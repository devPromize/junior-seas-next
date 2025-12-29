import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

export async function GET() {
  const {
    data: { user },
  } = await supabaseServer.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  // check admin
  const { data: profile } = await supabaseServer
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_admin) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await supabaseServer
    .from('orders')
    .select(`
      id,
      order_ref,
      amount,
      currency,
      payment_status,
      shipping_status,
      created_at,
      billing
    `)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json(
      { message: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ orders: data });
}

// app/api/account/orders/route.ts
import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const user_id = url.searchParams.get('user_id');
  if (!user_id) return NextResponse.json({ orders: [] });
  const { data, error } = await supabaseServer.from('orders').select('*').eq('user_id', user_id).order('created_at', { ascending: false });
  if (error) return NextResponse.json({ orders: [], error: error.message }, { status: 500 });
  return NextResponse.json({ orders: data });
}

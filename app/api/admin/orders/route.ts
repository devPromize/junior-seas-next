import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireAdmin } from '@/lib/requireAdmin';

export async function GET() {
  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  const { data, error } = await supabaseServer
    .from('orders')
    .select(`
      id,
      order_ref,
      amount,
      currency,
      payment_status,
      payment_method,
      payment_note,
      paid_at,
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

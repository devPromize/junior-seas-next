import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireAdmin } from '@/lib/requireAdmin';

// POST /api/admin/orders/mark-unpaid — undo a manual "mark as paid" (e.g.
// clicked in error). Resets the money state; the receipt email, if already
// sent, is not recalled.
export async function POST(req: Request) {
  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  const { order_ref } = await req.json();
  if (!order_ref) {
    return NextResponse.json(
      { message: 'Order reference required' },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseServer
    .from('orders')
    .update({
      payment_status: 'pending',
      payment_method: null,
      payment_note: null,
      paid_at: null,
    })
    .eq('order_ref', order_ref)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
  return NextResponse.json({ order: data });
}

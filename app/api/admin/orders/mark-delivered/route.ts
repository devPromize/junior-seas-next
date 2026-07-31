import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireAdmin } from '@/lib/requireAdmin';
import { sendDeliveryEmail } from '@/lib/sendDeliveryEmail';
import { koboToNaira } from '@/lib/payments';

// POST /api/admin/orders/mark-delivered — admin-gated. (The admin page used to
// call this path, but the route only existed un-gated under /api/orders; this
// is the correct, gated home for it.)
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

  const { data: order, error } = await supabaseServer
    .from('orders')
    .update({
      shipping_status: 'delivered',
      delivered_at: new Date().toISOString(),
    })
    .eq('order_ref', order_ref)
    .select()
    .single();

  if (error || !order) {
    return NextResponse.json(
      { message: 'Order not found or update failed' },
      { status: 400 }
    );
  }

  try {
    await sendDeliveryEmail({
      order_ref: order.order_ref,
      customer_email: order.billing?.email,
      customer_name:
        order.billing?.full_name || order.billing?.name || 'Customer',
      items: order.items,
      total_amount: koboToNaira(order.amount), // amount is stored in kobo
    });
  } catch (emailErr) {
    console.error('Delivery email failed:', emailErr);
  }

  return NextResponse.json({ order });
}

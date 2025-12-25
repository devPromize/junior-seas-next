// app/api/orders/mark-delivered/route.ts
import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { sendDeliveryEmail } from '@/lib/sendDeliveryEmail';

export async function POST(req: Request) {
  try {
    const { order_ref } = await req.json();
    if (!order_ref) {
      return NextResponse.json({ message: 'Order reference required' }, { status: 400 });
    }

    // 1️⃣ Update shipping_status to 'delivered'
    const { data: order, error } = await supabaseServer
      .from('orders')
      .update({ shipping_status: 'delivered', delivered_at: new Date().toISOString() })
      .eq('order_ref', order_ref)
      .select()
      .single();

    if (error || !order) {
      return NextResponse.json({ message: 'Order not found or update failed', error }, { status: 400 });
    }

    // 2️⃣ Send delivery email
    await sendDeliveryEmail({
      order_ref: order.order_ref,
      customer_email: order.billing.email,
      customer_name: order.billing.full_name,
      items: order.items,
      total_amount: order.amount,
    });

    return NextResponse.json({ message: 'Order marked as delivered and email sent', order });
  } catch (err: any) {
    console.error('Mark delivered error:', err);
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}

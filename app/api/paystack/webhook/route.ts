// app/api/paystack/webhook/route.ts
import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifyPaystackSignature, koboToNaira } from '@/lib/payments';
import { sendPaymentSuccessEmail } from '@/lib/sendPaymentSuccessEmail';

export async function POST(req: Request) {
  try {
    const payload = await req.text(); // raw text body
    const signature = req.headers.get('x-paystack-signature') || '';
    const secret = process.env.PAYSTACK_SECRET_KEY!;

    if (!verifyPaystackSignature(payload, signature, secret)) {
      console.warn('Invalid paystack signature');
      return NextResponse.json({ message: 'Invalid signature' }, { status: 400 });
    }

    const event = JSON.parse(payload);
    if (event.event === 'charge.success' || event.event === 'payment.success') {
      const data = event.data;
      const reference = data.reference;
      const metadata = data.metadata || {};
      // Mark the order paid.
      await supabaseServer.from('orders').update({
        payment_status: 'paid',
        paystack_ref: reference,
        payment_method: 'paystack',
        paid_at: new Date().toISOString(),
      }).eq('order_ref', reference);

      // Fetch the full order for the receipt email + cart clear.
      const { data: orderRows } = await supabaseServer
        .from('orders').select('*').eq('order_ref', reference).limit(1);
      const order = orderRows?.[0];

      if (order?.user_id) {
        await supabaseServer.from('carts').delete().eq('user_id', order.user_id);
      }

      // Send the payment receipt directly (the previous /api/send-order-email
      // route never existed). Idempotent, so verify can also send it safely.
      if (order) {
        try {
          await sendPaymentSuccessEmail({
            order_ref: order.order_ref,
            customer_email: order.billing?.email,
            customer_name:
              order.billing?.full_name || order.billing?.name || 'Customer',
            items: order.items,
            total_amount: koboToNaira(order.amount),
          });
        } catch (err) {
          console.error('Payment success email failed:', err);
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (e: any) {
    console.error('webhook error', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

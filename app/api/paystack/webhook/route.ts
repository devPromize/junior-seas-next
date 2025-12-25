// app/api/paystack/webhook/route.ts
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseServer } from '@/lib/supabaseServer';

export async function POST(req: Request) {
  try {
    const payload = await req.text(); // raw text body
    const signature = req.headers.get('x-paystack-signature') || '';
    const secret = process.env.PAYSTACK_SECRET_KEY!;

    const hash = crypto.createHmac('sha512', secret).update(payload).digest('hex');
    if (hash !== signature) {
      console.warn('Invalid paystack signature');
      return NextResponse.json({ message: 'Invalid signature' }, { status: 400 });
    }

    const event = JSON.parse(payload);
    if (event.event === 'charge.success' || event.event === 'payment.success') {
      const data = event.data;
      const reference = data.reference;
      const metadata = data.metadata || {};
      // Update order in DB by order_ref (reference)
      await supabaseServer.from('orders').update({
        payment_status: 'paid',
        paystack_ref: reference
      }).eq('order_ref', reference);

      // Optionally clear server-side cart if order.user_id exists
      const { data: orderRows } = await supabaseServer.from('orders').select('user_id').eq('order_ref', reference).limit(1);
      const order = orderRows?.[0];
      if (order?.user_id) {
        await supabaseServer.from('carts').delete().eq('user_id', order.user_id);
      }

      // Optionally send email via your send-order-email route
      try {
        await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/send-order-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order_ref: reference }),
        });
      } catch (err) {
        console.error('send email error', err);
      }
    }

    return NextResponse.json({ received: true });
  } catch (e: any) {
    console.error('webhook error', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

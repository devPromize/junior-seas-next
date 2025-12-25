import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { sendPaymentSuccessEmail } from '@/lib/sendPaymentSuccessEmail';

const SITE_URL = process.env.NEXT_PUBLIC_BASE_URL!;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const reference = searchParams.get('reference');

  if (!reference) {
    return NextResponse.redirect(`${SITE_URL}/payment/failed`);
  }

  // 1️⃣ Verify transaction with Paystack
  const paystackRes = await fetch(
    `https://api.paystack.co/transaction/verify/${reference}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      },
    }
  );

  const paystackData = await paystackRes.json();

  if (!paystackData.status || paystackData.data.status !== 'success') {
    return NextResponse.redirect(
      `${SITE_URL}/payment/failed?ref=${reference}`
    );
  }

  // 2️⃣ Fetch order
  const { data: order, error } = await supabaseServer
    .from('orders')
    .select('*')
    .eq('order_ref', reference)
    .single();

  if (error || !order) {
    return NextResponse.redirect(
      `${SITE_URL}/payment/failed?ref=${reference}`
    );
  }

  // 3️⃣ Idempotency guard
  if (order.payment_status === 'paid') {
    return NextResponse.redirect(
      `${SITE_URL}/payment/success?ref=${reference}`
    );
  }

  // 4️⃣ Update order
  await supabaseServer
    .from('orders')
    .update({
      payment_status: 'paid',
      paystack_ref: reference,
      payment_method: 'paystack',
      paid_at: new Date().toISOString(),
    })
    .eq('order_ref', reference);

  // 5️⃣ Clear server cart (if user exists)
  if (order.user_id) {
    await supabaseServer
      .from('carts')
      .delete()
      .eq('user_id', order.user_id);

      console.log('Cart cleared for user:', order.user_id);
  }

await sendPaymentSuccessEmail({
  order_ref: order.order_ref,
  customer_email: order.billing.email,
  customer_name: order.billing.full_name,
  items: order.items,
  total_amount: order.amount / 100,
});


  // 6️⃣ Redirect to success page
  return NextResponse.redirect(
    `${SITE_URL}/payment/success?ref=${reference}`
  );
}

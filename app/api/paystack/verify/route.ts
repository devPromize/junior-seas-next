import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { sendPaymentSuccessEmail } from '@/lib/sendPaymentSuccessEmail';
import { koboToNaira } from '@/lib/payments';

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

  // 3️⃣ Mark paid + clear cart, but only if not already done. The webhook may
  //    have gotten here first — that's fine; we still send the receipt below.
  if (order.payment_status !== 'paid') {
    await supabaseServer
      .from('orders')
      .update({
        payment_status: 'paid',
        paystack_ref: reference,
        payment_method: 'paystack',
        paid_at: new Date().toISOString(),
      })
      .eq('order_ref', reference);

    if (order.user_id) {
      await supabaseServer.from('carts').delete().eq('user_id', order.user_id);
    }
  }

  // 4️⃣ Send the payment receipt. sendPaymentSuccessEmail dedupes on
  //    order_emails(type='payment_success'), so this is safe even if the webhook
  //    already sent it — and it now runs even when the order was already paid.
  try {
    await sendPaymentSuccessEmail({
      order_ref: order.order_ref,
      customer_email: order.billing?.email,
      customer_name:
        order.billing?.full_name || order.billing?.name || 'Customer',
      items: order.items,
      total_amount: koboToNaira(order.amount),
    });
  } catch (emailErr) {
    console.error('Payment success email failed:', emailErr);
  }

  // 5️⃣ Redirect to success page
  return NextResponse.redirect(
    `${SITE_URL}/payment/success?ref=${reference}`
  );
}

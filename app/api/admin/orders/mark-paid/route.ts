import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireAdmin } from '@/lib/requireAdmin';
import { markPaidSchema } from '@/lib/validation';
import { koboToNaira } from '@/lib/payments';
import { sendPaymentSuccessEmail } from '@/lib/sendPaymentSuccessEmail';

// POST /api/admin/orders/mark-paid — manually confirm an off-platform payment
// (bank transfer, WhatsApp, cash, etc.). Card payments are marked paid
// automatically by the Paystack verify/webhook routes, so this is only for the
// rest.
export async function POST(req: Request) {
  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  const body = await req.json();
  const parsed = markPaidSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid data', issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 }
    );
  }

  const { order_ref, method, note, send_receipt } = parsed.data;

  const { data: order, error: fetchErr } = await supabaseServer
    .from('orders')
    .select('*')
    .eq('order_ref', order_ref)
    .single();

  if (fetchErr || !order) {
    return NextResponse.json({ message: 'Order not found' }, { status: 404 });
  }

  if (order.payment_status === 'paid') {
    return NextResponse.json(
      { message: 'Order is already marked paid' },
      { status: 409 }
    );
  }

  const { data: updated, error } = await supabaseServer
    .from('orders')
    .update({
      payment_status: 'paid',
      payment_method: method,
      payment_note: note || null,
      paid_at: new Date().toISOString(),
    })
    .eq('order_ref', order_ref)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  // Clear the customer's server cart, matching the card-payment flow.
  if (order.user_id) {
    await supabaseServer.from('carts').delete().eq('user_id', order.user_id);
  }

  // Send the receipt unless the admin opted out (e.g. cash/in-person).
  // sendPaymentSuccessEmail dedupes on order_emails, so it's safe.
  if (send_receipt) {
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
      console.error('Payment receipt email failed:', emailErr);
    }
  }

  return NextResponse.json({ order: updated });
}

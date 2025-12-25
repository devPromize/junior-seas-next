import { supabaseServer } from '@/lib/supabaseServer';

import { sendEmail } from '@/lib/sendEmail';

type PaymentSuccessPayload = {
  order_ref: string;
  customer_email: string;
  customer_name: string;
  items: any[];
  total_amount: number;
};

export async function sendPaymentSuccessEmail({
  order_ref,
  customer_email,
  customer_name,
  items,
  total_amount,
}: PaymentSuccessPayload) {
  

  // 🔐 Idempotency check (VERY IMPORTANT)
  const { data: alreadySent } = await supabaseServer
    .from('order_emails')
    .select('id')
    .eq('order_ref', order_ref)
    .eq('type', 'payment_success')
    .maybeSingle();


  if (alreadySent) {
    console.log(`📨 Payment email already sent for ${order_ref}`);
    return;
  }

  const itemsHtml = items
    .map(
      (i) =>
        `<li>${i.name} × ${i.quantity} — ₦${i.price.toLocaleString()}</li>`
    )
    .join('');

  const customerHtml = `
    <h2>Payment Successful 🎉</h2>
    <p>Hello ${customer_name},</p>

    <p>Your payment for order <strong>${order_ref}</strong> has been confirmed.</p>

    <ul>${itemsHtml}</ul>

    <p><strong>Total Paid:</strong> ₦${total_amount.toLocaleString()}</p>

    <h3>Shipping Information</h3>
    <p>
      📦 Your order will be processed within <strong>24–48 hours</strong>.<br/>
        🚚 You will be notified once your package arrives at its destination.

    <p>Thank you for shopping with us.</p>
  `;

  // ✅ Send customer email
  await sendEmail({
    to: customer_email,
    subject: `Payment Confirmed — ${order_ref}`,
    html: customerHtml,
    text: `Hello ${customer_name},
Your payment for order ${order_ref} has been confirmed.
Total Paid: ₦${total_amount.toLocaleString()}.
Shipping begins within 24–48 hours.
Thank you for shopping with us.`,
  });

  // 🧾 Record email (typed)
//   await supabaseServer.from('order_emails').insert({
//     order_ref,
//     type: 'payment_success',
//     sent_at: new Date().toISOString(),
//   });

//   console.log(`✅ Payment success email sent for ${order_ref}`);

const { data, error } = await supabaseServer
  .from('order_emails')
  .insert({
    order_ref,
    type: 'payment_success',
    sent_at: new Date().toISOString(),
  })
  .select(); 

console.error('📛 ORDER EMAIL INSERT ERROR:', error);
}

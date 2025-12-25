// lib/sendDeliveryEmail.ts
import { createClient } from '@/lib/services/client';
import { sendEmail } from '@/lib/sendEmail';

type DeliveryEmailPayload = {
  order_ref: string;
  customer_email: string;
  customer_name: string;
  items: any[];
  total_amount: number;
};

export async function sendDeliveryEmail({
  order_ref,
  customer_email,
  customer_name,
  items,
  total_amount,
}: DeliveryEmailPayload) {
  const supabase = createClient();

  // 🔐 Idempotency check
  const { data: alreadySent } = await supabase
    .from('order_emails')
    .select('id')
    .eq('order_ref', order_ref)
    .eq('type', 'delivery')
    .maybeSingle();

  if (alreadySent) {
    console.log(`📨 Delivery email already sent for ${order_ref}`);
    return;
  }

  const itemsHtml = items
    .map((i) => `<li>${i.name} × ${i.quantity} — ₦${i.price.toLocaleString()}</li>`)
    .join('');

  const html = `
    <h2>Order Delivered 📦</h2>
    <p>Hello ${customer_name},</p>
    <p>Your order <strong>${order_ref}</strong> has arrived at its destination.</p>
    <ul>${itemsHtml}</ul>
    <p><strong>Total Paid:</strong> ₦${total_amount.toLocaleString()}</p>
    <p>Thank you for shopping with us! We hope you enjoy your items.</p>
  `;

  // ✅ Send email
  await sendEmail({
    to: customer_email,
    subject: `Order Delivered — ${order_ref}`,
    html,
    text: `Hello ${customer_name}, your order ${order_ref} has been delivered. Total: ₦${total_amount.toLocaleString()}. Thank you for shopping with us!`,
  });

  // 🧾 Record in order_emails
  const { data, error } = await supabase.from('order_emails').insert({
    order_ref,
    type: 'delivery',
    sent_at: new Date().toISOString(),
  }).select();

  console.log('📨 DELIVERY EMAIL INSERT RESULT:', data);
  if (error) console.error('📛 DELIVERY EMAIL INSERT ERROR:', error);
}

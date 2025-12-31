import { createClient } from '@/lib/services/client';
import { sendEmail } from '@/lib/sendEmail';

type OrderEmailPayload = {
  order_ref: string;
  customer_email: string;
  customer_name: string;
  items: any[];
  total_amount: number;
};

export async function sendOrderEmails({
  order_ref,
  customer_email,
  customer_name,
  items,
  total_amount,
}: OrderEmailPayload) {
  const supabase = createClient();

  // 🔐 Idempotency check
  const { data: alreadySent } = await supabase
    .from('order_emails')
    .select('id')
    .eq('order_ref', order_ref)
    .maybeSingle();

  if (alreadySent) {
    console.log(`📨 Email already sent for ${order_ref}`);
    return;
  }

  const itemsHtml = items
    .map(
      (i) =>
        `<li>${i.name} × ${i.quantity} — ₦${i.price.toLocaleString()}</li>`
    )
    .join('');

  const customerHtml = `
    <h2>Order Received</h2>
    <p>Hello ${customer_name},</p>

    <p>Your order has been received successfully.</p>

    <p><strong>Order Reference:</strong> ${order_ref}</p>

    <ul>${itemsHtml}</ul>

    <p><strong>Total:</strong> ₦${total_amount.toLocaleString()}</p>

    <h3>Payment Options</h3>
    <p>
      NOMBANK MFB<br/>
      DE JUNIOR SEAS GLOBAL LTD<br/>
      5307422779<br/>
      Reference: <strong>${order_ref}</strong>
    </p>

    <p>
      After payment, send proof via WhatsApp:
      <strong>+234 810 616 5292</strong>
    </p>
  `;

  const adminHtml = `
    <h2>New Order Placed</h2>
    <p><strong>Order Ref:</strong> ${order_ref}</p>
    <p><strong>Customer:</strong> ${customer_name}</p>
    <p><strong>Email:</strong> ${customer_email}</p>
    <p><strong>Total:</strong> ₦${total_amount.toLocaleString()}</p>
    <ul>${itemsHtml}</ul>
  `;

// ✅ Send customer email (must succeed)
await sendEmail({
  to: customer_email,
  subject: `Order Confirmation — ${order_ref}`,
  html: customerHtml,
  text: `Hello ${customer_name}, your order ${order_ref} has been received. Total: ₦${total_amount.toLocaleString()}.
Please pay via bank transfer:
NOMBANK MFB - DE JUNIOR SEAS GLOBAL LTD - 5307422779
Reference: ${order_ref}
After payment, send proof via WhatsApp: +234 810 616 5292
Thank you for shopping with us.`
});



  // ⚠️ Admin email should NEVER block order flow
  try {
    if (process.env.ADMIN_EMAIL) {
      await sendEmail({
        to: process.env.ADMIN_EMAIL,
        subject: `New Order — ${order_ref}`,
        html: adminHtml,
      });
    }
  } catch (err) {
    console.error('Admin email failed:', err);
  }

  // 🧾 Record email sent
  await supabase.from('order_emails').insert({
    order_ref,
    sent_at: new Date().toISOString(),
  });

  console.log(`✅ Order emails sent for ${order_ref}`);
}

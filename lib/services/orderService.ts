// services/orderService.ts
import { supabaseServer } from '@/lib/supabaseServer';

/**
 * Create order and order_items rows. Returns the created order row.
 * items: array of { _id, productId, name, price, quantity, meta? }
 * amount is in kobo (integer).
 */
export async function createOrderServer({
  user_id = null,
  billing,
  shipping = null,
  items,
  amount,
  currency = 'NGN',
  payment_method = 'transfer', // 'paystack' if chosen
}: {
  user_id?: string | null;
  billing: any;
  shipping?: any | null;
  items: any[];
  amount: number;
  currency?: string;
  payment_method?: string;
}) {
  // build order_ref
  const order_ref = `ORD-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.floor(Math.random()*90000)}`;

  // build order payload
  const orderPayload = {
    user_id,
    order_ref,
    items,
    billing,
    shipping,
    amount, // store kobo
    currency,
    payment_status: 'pending',
    payment_method,
  };

  const { data: order, error: insertErr } = await supabaseServer
    .from('orders')
    .insert(orderPayload)
    .select()
    .single();

  if (insertErr) throw insertErr;
  return order;
}

export async function markOrderPaidByRef(order_ref: string, paystack_ref?: string) {
  const { error } = await supabaseServer
    .from('orders')
    .update({ payment_status: 'paid', paystack_ref })
    .eq('order_ref', order_ref);

  if (error) throw error;
  return true;
}

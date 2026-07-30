import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/requireUser';

// GET /api/account/orders — the logged-in customer's own order history.
export async function GET() {
  const { user, supabase } = await requireUser();
  if (!user) return NextResponse.json({ orders: [] }, { status: 401 });

  // RLS ("users can read their orders") also scopes this to the caller; the
  // explicit user_id filter is a belt-and-braces match.
  const { data: orders, error } = await supabase
    .from('orders')
    .select(
      'id, order_ref, amount, currency, payment_status, shipping_status, created_at, items'
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json(
      { orders: [], error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ orders });
}

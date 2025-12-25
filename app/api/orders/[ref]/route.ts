import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

export async function GET(
  _req: Request,
  context: { params: { ref: string } }
) {
  const { ref } = await context.params;

  const { data: order, error } = await supabaseServer
    .from('orders')
    .select('*')
    .eq('order_ref', ref)
    .single();

  if (error || !order) {
    return NextResponse.json(
      { message: 'Order not found' },
      { status: 404 }
    );
  }

  return NextResponse.json(order);
}

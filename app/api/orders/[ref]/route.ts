import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ref: string }> }
 
) {
  const { ref } = await params;

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

import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireAdmin } from '@/lib/requireAdmin';
import { stockUpdateSchema } from '@/lib/validation';

// PATCH /api/admin/stock — set per-location stock for one or more variants.
export async function PATCH(req: Request) {
  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  const body = await req.json();
  const parsed = stockUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid stock data', issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 }
    );
  }

  const { location_id, updates } = parsed.data;

  // 1) Canonical write: upsert into location_stock.
  const rows = updates.map((u) => ({
    location_id,
    product_id: u.product_id,
    variant_sku: u.variant_sku,
    quantity: u.quantity,
    source: 'manual',
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabaseServer
    .from('location_stock')
    .upsert(rows, { onConflict: 'location_id,product_id,variant_sku' });

  if (error) return NextResponse.json({ message: error.message }, { status: 500 });

  // 2) Transitional mirror (removed in Phase D): the storefront still reads
  //    variants[].stock, so mirror the new quantities into the product JSON and
  //    refresh the derived in_stock flag. Safe while there is a single location.
  const productIds = [...new Set(updates.map((u) => u.product_id))];
  for (const pid of productIds) {
    const { data: prod } = await supabaseServer
      .from('products')
      .select('variants')
      .eq('id', pid)
      .single();

    const variants = Array.isArray(prod?.variants) ? prod!.variants : [];
    const forProduct = updates.filter((u) => u.product_id === pid);
    const newVariants = variants.map((v: any) => {
      const u = forProduct.find((x) => x.variant_sku === v.sku);
      return u ? { ...v, stock: u.quantity } : v;
    });
    const anyStock = newVariants.some((v: any) => Number(v.stock ?? 0) > 0);

    await supabaseServer
      .from('products')
      .update({ variants: newVariants, in_stock: anyStock })
      .eq('id', pid);
  }

  return NextResponse.json({ ok: true });
}

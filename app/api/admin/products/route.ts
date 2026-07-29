import { NextResponse } from 'next/server';
import slugify from 'slugify';
import { randomUUID } from 'crypto';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireAdmin } from '@/lib/requireAdmin';
import { adminProductCreateSchema } from '@/lib/validation';

// GET /api/admin/products?location=<uuid>
// All products, each variant annotated with its stock for the given location.
export async function GET(req: Request) {
  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const locationId = searchParams.get('location');

  const { data: products, error } = await supabaseServer
    .from('products')
    .select('id, name, brand, category, status, in_stock, images, variants, created_at')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ message: error.message }, { status: 500 });

  // Build a { "productId:sku" -> quantity } map for the selected location.
  const stockByKey: Record<string, number> = {};
  if (locationId) {
    const { data: stock } = await supabaseServer
      .from('location_stock')
      .select('product_id, variant_sku, quantity')
      .eq('location_id', locationId);
    (stock || []).forEach((s: any) => {
      stockByKey[`${s.product_id}:${s.variant_sku}`] = s.quantity;
    });
  }

  const withStock = (products || []).map((p: any) => {
    const variants = Array.isArray(p.variants) ? p.variants : [];
    let total = 0;
    const annotated = variants.map((v: any) => {
      const qty = locationId
        ? stockByKey[`${p.id}:${v.sku}`] ?? 0
        : Number(v.stock ?? 0);
      total += qty;
      return { ...v, location_quantity: qty };
    });
    return { ...p, variants: annotated, total_stock: total };
  });

  return NextResponse.json({ products: withStock });
}

// POST /api/admin/products — create a product + seed per-location stock.
export async function POST(req: Request) {
  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  const body = await req.json();
  const parsed = adminProductCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid product data', issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 }
    );
  }

  const { location_id, variants = [], ...fields } = parsed.data as any;

  // Every variant gets a stable sku (matches the Phase A backfill convention).
  const variantsWithSku = variants.map((v: any) => ({
    ...v,
    sku: v.sku || randomUUID(),
  }));

  const slug = fields.name ? slugify(fields.name, { lower: true }) : undefined;

  const { data: product, error } = await supabaseServer
    .from('products')
    .insert({ ...fields, variants: variantsWithSku, slug })
    .select()
    .single();

  if (error || !product) {
    return NextResponse.json(
      { message: error?.message || 'Failed to create product' },
      { status: 500 }
    );
  }

  // Seed location_stock for every active location. The entered stock applies to
  // the chosen (or primary) location; other locations start at 0.
  const { data: locations } = await supabaseServer
    .from('locations')
    .select('id, slug')
    .eq('is_active', true);

  if (locations && locations.length) {
    const target =
      location_id ||
      locations.find((l: any) => l.slug === 'owerri')?.id ||
      locations[0].id;

    const rows: any[] = [];
    for (const loc of locations) {
      for (const v of variantsWithSku) {
        rows.push({
          location_id: loc.id,
          product_id: product.id,
          variant_sku: v.sku,
          quantity: loc.id === target ? Number(v.stock ?? 0) : 0,
          source: 'manual',
        });
      }
    }
    if (rows.length) {
      await supabaseServer
        .from('location_stock')
        .upsert(rows, { onConflict: 'location_id,product_id,variant_sku' });
    }
  }

  return NextResponse.json({ product });
}

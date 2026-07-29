import { NextResponse } from 'next/server';
import slugify from 'slugify';
import { randomUUID } from 'crypto';
import { supabaseServer } from '@/lib/supabaseServer';
import { requireAdmin } from '@/lib/requireAdmin';
import { adminProductUpdateSchema } from '@/lib/validation';

// PATCH /api/admin/products/[id] — update product fields/variants.
export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  const { id } = await context.params;
  const body = await req.json();
  const parsed = adminProductUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid product data', issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 }
    );
  }

  const updates: any = { ...parsed.data };
  if (updates.name) updates.slug = slugify(updates.name, { lower: true });
  // Keep every variant's stable sku (generate for any newly-added variant).
  if (Array.isArray(updates.variants)) {
    updates.variants = updates.variants.map((v: any) => ({
      ...v,
      sku: v.sku || randomUUID(),
    }));
  }

  const { data, error } = await supabaseServer
    .from('products')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  return NextResponse.json({ product: data });
}

// DELETE /api/admin/products/[id] — location_stock rows cascade via FK.
export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { error: authError } = await requireAdmin();
  if (authError) return authError;

  const { id } = await context.params;
  const { error } = await supabaseServer.from('products').delete().eq('id', id);
  if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

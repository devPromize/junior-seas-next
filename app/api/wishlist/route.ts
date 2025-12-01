// app/api/wishlist/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/services/server';

/**
 * Wishlist API
 * GET   -> returns { items: [...] } for the logged-in user
 * PUT   -> replace server wishlist with provided { items: [...] }
 * POST  -> merge provided local items into server wishlist (union)
 */

async function getUser(supabase: ReturnType<typeof createClient extends (...a: any) => any ? any : any>) {
  try {
    const { data } = await supabase.auth.getUser();
    return data?.user ?? null;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const supabase = await createClient();
    const user = await getUser(supabase);
    if (!user) return NextResponse.json({ items: [] });

    const { data, error } = await supabase.from('wishlists').select('items').eq('user_id', user.id).single();
    if (error) return NextResponse.json({ items: [] });

    return NextResponse.json({ items: data?.items ?? [] });
  } catch (err) {
    console.error('GET /api/wishlist error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const items = Array.isArray(body.items) ? body.items : [];

    const supabase = await createClient();
    const user = await getUser(supabase);
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { data, error } = await supabase
      .from('wishlists')
      .upsert({ user_id: user.id, items }, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ items: data.items ?? [] });
  } catch (err) {
    console.error('PUT /api/wishlist error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/**
 * Merge: union by productId + variantId (no quantities)
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const localItems = Array.isArray(body.items) ? body.items : [];

    const supabase = await createClient();
    const user = await getUser(supabase);
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { data: existing } = await supabase.from('wishlists').select('items').eq('user_id', user.id).single();
    let serverItems: any[] = (existing?.items) ?? [];

    const map = new Map<string, any>();
    const key = (it: any) => `${it.productId}::${it.variantId ?? 'v'}`;

    [...serverItems, ...localItems].forEach((it: any) => {
      const k = key(it);
      if (!map.has(k)) map.set(k, it);
    });

    const merged = Array.from(map.values());

    const { data: upserted, error: upErr } = await supabase
      .from('wishlists')
      .upsert({ user_id: user.id, items: merged }, { onConflict: 'user_id' })
      .select()
      .single();

    if (upErr) throw upErr;
    return NextResponse.json({ items: upserted.items ?? [] });
  } catch (err) {
    console.error('POST /api/wishlist (merge) error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

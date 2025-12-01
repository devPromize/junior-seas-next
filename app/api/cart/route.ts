// app/api/cart/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/services/server'; // your SSR helper that uses cookies()

/**
 * Cart API
 * GET   -> returns { items: [...] } for the logged-in user (or empty array)
 * PUT   -> replace server cart with provided { items: [...] }
 * POST  -> merge provided local items into server cart and return merged items
 *
 * Items shape: array of { productId, variantId?, quantity, price?, meta?: {...} }
 */

async function getUser(supabase: ReturnType<typeof createClient extends (...a: any) => any ? any : any>) {
  // createClient returns a Supabase server client; use its auth.getUser to resolve user from cookies
  try {
    const { data } = await supabase.auth.getUser();
    return data?.user ?? null;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const user = await getUser(supabase);
    if (!user) {
      // Not authenticated -> return empty cart (client can handle prompt to login)
      return NextResponse.json({ items: [] });
    }

    const { data, error } = await supabase
      .from('carts')
      .select('items')
      .eq('user_id', user.id)
      .single();

    if (error) {
      // if row does not exist, return empty
      return NextResponse.json({ items: [] });
    }

    return NextResponse.json({ items: data?.items ?? [] });
  } catch (err) {
    console.error('GET /api/cart error', err);
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

    // upsert by user_id
    const { data, error } = await supabase
      .from('carts')
      .upsert({ user_id: user.id, items }, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ items: data.items ?? [] });
  } catch (err) {
    console.error('PUT /api/cart error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/**
 * Merge local items (client) into server cart.
 * Body: { items: [...] }
 * Merge policy: same productId + variantId -> sum quantities
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const localItems = Array.isArray(body.items) ? body.items : [];

    const supabase = await createClient();
    const user = await getUser(supabase);
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    // get existing server cart
    const { data: existing, error: getErr } = await supabase.from('carts').select('items').eq('user_id', user.id).single();
    let serverItems: any[] = (existing?.items) ?? [];

    // merge
    const map = new Map<string, any>();
    const key = (it: any) => `${it.productId}::${it.variantId ?? 'v'}`;

    [...serverItems, ...localItems].forEach((it: any) => {
      const k = key(it);
      if (!map.has(k)) {
        map.set(k, { ...it, quantity: Number(it.quantity) || 0 });
      } else {
        const cur = map.get(k);
        cur.quantity = (Number(cur.quantity) || 0) + (Number(it.quantity) || 0);
        map.set(k, cur);
      }
    });

    const merged = Array.from(map.values());

    // upsert merged
    const { data: upserted, error: upErr } = await supabase
      .from('carts')
      .upsert({ user_id: user.id, items: merged }, { onConflict: 'user_id' })
      .select()
      .single();

    if (upErr) throw upErr;
    return NextResponse.json({ items: upserted.items ?? [] });
  } catch (err) {
    console.error('POST /api/cart (merge) error', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

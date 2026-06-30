// src/app/api/search/route.ts
import { createClient } from '@/lib/services/server';
import { NextResponse } from 'next/server';
import { searchQuerySchema } from '@/lib/validation';

export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);

    // Validate + normalize the search term (trim + length cap) before using it.
    const parsed = searchQuerySchema.safeParse(searchParams.get('q') ?? '');
    if (!parsed.success) {
      return NextResponse.json(
        { products: [], error: 'Invalid search query' },
        { status: 400 }
      );
    }
    const q = parsed.data;

    if (!q) {
      return NextResponse.json({ products: [] }, { status: 200 });
    }

    // Full-text search via the search_products() Postgres function: English
    // stemming so word variants match (e.g. "iphones" finds "iPhone"), with a
    // name/brand substring fallback so everything the old search found is still
    // found. See the search_products SQL function in Supabase.
    const { data, error } = await supabase.rpc('search_products', { q });

    if (error) throw error;

    // Reformat results to match highlights structure
    const products = (data || []).map((p: any) => ({
      ...p,
      image:
        p.image ||
        p?.variants?.[0]?.image ||
        (Array.isArray(p.images) ? p.images[0] : null) ||
        '/placeholder.png',
      variants: Array.isArray(p.variants) ? p.variants : [],
    }));

    // Optional: log search to search_history
    await supabase.from('search_history').insert([
      {
        query: q,
        product_id: products?.[0]?.id || null,
        user_id: null,
      },
    ]);

    return NextResponse.json({ products }, { status: 200 });
  } catch (error: any) {
    console.error('❌ Error in searchProducts:', error.message || error);
    return NextResponse.json(
      { error: error.message || 'Search failed' },
      { status: 500 }
    );
  }
}

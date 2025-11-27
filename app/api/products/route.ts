//========================================================//
//=======================================================
// app/api/products/route.ts
import { createProduct, fetchProducts } from '@/lib/services/productService';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '12');
    const category = searchParams.get('category') || undefined;
    const search = searchParams.get('search') || undefined;
    const price_min = searchParams.get('price_min')
      ? parseInt(searchParams.get('price_min')!)
      : undefined;
    const price_max = searchParams.get('price_max')
      ? parseInt(searchParams.get('price_max')!)
      : undefined;
    const ram = searchParams.get('ram') || undefined;
    const rom = searchParams.get('rom') || undefined;
    const color = searchParams.get('color') || undefined;

    const sortBy = searchParams.get('sortBy') || 'created_at';
    let sortOrder: 'asc' | 'desc' | undefined;
    if (
      searchParams.get('sortOrder') === 'asc' ||
      searchParams.get('sortOrder') === 'desc'
    ) {
      sortOrder = searchParams.get('sortOrder') as 'asc' | 'desc';
    }

    const { data, count } = await fetchProducts({
      page,
      limit,
      category,
      price_min,
      price_max,
      ram,
      rom,
      color,
      search,
      sortBy,
      sortOrder,
    });

    return NextResponse.json({
      products: data,
      total: count ?? 0,
      page,
      limit,
      totalPages: count ? Math.ceil(count / limit) : 1,
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const productData = await req.json();
    const newProduct = await createProduct(productData);
    return NextResponse.json(newProduct);
  } catch (error) {
    console.error('Error creating product:', error);
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}

// app/api/products/price-bounds/route.ts
import { fetchPriceBounds } from '@/lib/services/productService';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const data = await fetchPriceBounds();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Failed to fetch price bounds', error);
    return NextResponse.json({ error: 'Failed to fetch price bounds' }, { status: 500 });
  }
}

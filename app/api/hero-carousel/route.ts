import { fetchHeroCarousel } from '@/lib/services/heroCarousel';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const slides = await fetchHeroCarousel();
    return NextResponse.json({ success: true, slides });
  } catch (error) {
    console.error('Error fetching user:', error);
    return NextResponse.json(
      { success: false, error: 'Server error' },
      { status: 500 }
    );
  }
}


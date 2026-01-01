import { fetchFeedCarousel } from '@/lib/services/feedCarousel';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const slides = await fetchFeedCarousel();
    return NextResponse.json({ success: true, slides });
  } catch (error) {
    console.error('Error fetching user:', error);
    return NextResponse.json(
      { success: false, error: 'Server error' },
      { status: 500 }
    );
  }
}

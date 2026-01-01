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


// // app/api/hero-carousel/route.ts
// import { NextResponse } from 'next/server';
// import { supabaseServer } from '@/lib/supabaseServer';

// export async function GET() {
//   const { data, error } = await supabaseServer
//     .from('hero_carousel')
//     .select('*')
//     .eq('active', true)
//     .order('position');

//   if (error) return NextResponse.json({ slides: [] });

//   return NextResponse.json({ slides: data });
// }

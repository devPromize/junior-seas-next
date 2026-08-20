import { supabase } from '@/lib/supabaseClient';

export interface HeroSlide {
  id: number;
  image_url: string;
  title: string;
  description: string;
}

// Hero slides are public content, so this reads with the plain anon client rather
// than the cookie-bound SSR client: touching cookies() would opt the homepage out
// of static rendering, which is exactly what we're trying to avoid for LCP.
export const fetchHeroCarousel = async (): Promise<
  HeroSlide[]
> => {
  const { data, error } = await supabase
    .from('hero_carousel')
    .select('*')
    .order('id', { ascending: true });

  if (error)
    throw new Error(
      'Failed to fetch hero carousel: ' + error.message
    );

  return data ?? [];
};

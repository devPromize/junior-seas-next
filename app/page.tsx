import FeedCarousel from '@/ui/FeedCarousel';
import GoogleReviews from '@/ui/GoogleReviews';
import HeroCarousel from '@/ui/HeroCarousel';
import Highlights from '@/ui/highlights/Highlights';
import Perks from '@/ui/Perks';
import { fetchHeroCarousel } from '@/lib/services/heroCarousel';

// Hero slides change rarely, so serve a cached render and refresh hourly.
export const revalidate = 3600;

export default async function Home() {
  // A failed slide fetch shouldn't take the whole homepage down — the carousel
  // renders nothing and the rest of the page still works.
  const slides = await fetchHeroCarousel().catch((error) => {
    console.error('Hero carousel fetch failed:', error);
    return [];
  });

  return (
    <>
      <HeroCarousel slides={slides} />
      <Perks />
      <Highlights />
      <FeedCarousel />
      <GoogleReviews />
    </>
  );
}

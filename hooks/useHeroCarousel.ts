import { useQuery } from '@tanstack/react-query';
import { getHeroCarousel } from '../services/carousels-service';

export const useHeroCarousel = () => {
  return useQuery({
    queryKey: ['hero-carousel'],
    queryFn: () => getHeroCarousel(),
    // refetchOnWindowFocus: false,
  });
};

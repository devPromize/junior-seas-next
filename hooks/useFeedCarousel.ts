import { useQuery } from '@tanstack/react-query';
import { getFeedCarousel } from '../services/carousels-service';

export const useFeedCarousel = () => {
  return useQuery({
    queryKey: ['feed-carousel'],
    queryFn: () => getFeedCarousel(),
    // refetchOnWindowFocus: false,
  });
};

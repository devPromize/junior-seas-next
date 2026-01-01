import { useQuery } from '@tanstack/react-query';
import { getFeedCarousel } from '../services/carousels-service';

export const useFeedCarousel = () => {
  return useQuery({
    queryKey: ['feed-carousel'],
    queryFn: () => getFeedCarousel(),
    // refetchOnWindowFocus: false,
  });
};




// 'use client';
// import { useEffect, useState } from 'react';
// import axios from '../lib/axios';

// interface Slide {
//   id: number;
//   image_url: string;
//   title: string;
//   description: string;
// }

// export const useFeedCarousel = () => {
//   const [data, setData] = useState<Slide[]>([]);
//   const [isLoading, setIsLoading] = useState(true);
//   const [error, setError] = useState<any>(null);

//   useEffect(() => {
//     const fetchSlides = async () => {
//       try {
//         const res = await axios.get('/feed-carousel');
//         setData(res.data.slides || []);
//       } catch (err) {
//         console.error(err);
//         setError(err);
//       } finally {
//         setIsLoading(false);
//       }
//     };
//     fetchSlides();
//   }, []);

//   return { data, isLoading, error };
// };

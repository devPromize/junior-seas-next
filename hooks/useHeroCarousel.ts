import { useQuery } from '@tanstack/react-query';
import { getHeroCarousel } from '../services/carousels-service';

export const useHeroCarousel = () => {
  return useQuery({
    queryKey: ['hero-carousel'],
    queryFn: () => getHeroCarousel(),
    // refetchOnWindowFocus: false,
  });
};



// 'use client';
// import { useEffect, useState } from 'react';
// import axios from '../lib/axios'; // or use your existing axiosInstance

// interface Slide {
//   id: number;
//   image_url: string;
//   title: string;
//   description: string;
// }

// export const useHeroCarousel = () => {
//   const [data, setData] = useState<Slide[]>([]);
//   const [isLoading, setIsLoading] = useState(true);
//   const [error, setError] = useState<any>(null);

//   useEffect(() => {
//     const fetchSlides = async () => {
//       try {
//         const res = await axios.get('/hero-carousel'); // make sure /api/hero-carousel works in prod
//         setData(res.data.slides || []); // adjust if your API returns data differently
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


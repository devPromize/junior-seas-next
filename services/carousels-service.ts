// 'use client';
// import axiosInstance from '../lib/axios';
// export const getHeroCarousel = async () => {
//   const response = await axiosInstance.get(
//     '/hero-carousel'
//   );
//   return response.data?.slides ?? [];
// };
// export const getFeedCarousel = async () => {
//   const response = await axiosInstance.get(
//     '/feed-carousel'
//   );
//   return response.data?.slides ?? [];

//   // return response.data.feedCarousel || []; // Adjust this based on your backend response shape
// };



'use server';

import { supabaseServer } from '@/lib/supabaseServer';

export async function getHeroCarousel() {
  const { data, error } = await supabaseServer
    .from('hero_carousel')
    .select('*')
    .eq('active', true)
    .order('position');

  if (error) {
    console.error(error);
    return [];
  }

  return data ?? [];
}

export async function getFeedCarousel() {
  const { data, error } = await supabaseServer
    .from('feed_carousel')
    .select('*')
    .eq('active', true)
    .order('position');

  if (error) {
    console.error(error);
    return [];
  }

  return data ?? [];
}

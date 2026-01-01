'use client';
import axiosInstance from '../lib/axios';
export const getHeroCarousel = async () => {
  const response = await axiosInstance.get(
    '/hero-carousel'
  );
  return response.data?.slides ?? [];
};
export const getFeedCarousel = async () => {
  const response = await axiosInstance.get(
    '/feed-carousel'
  );
  return response.data?.slides ?? [];

  // return response.data.feedCarousel || []; // Adjust this based on your backend response shape
};
import axios from 'axios';

const baseURL = process.env.NEXT_PUBLIC_BASE_URL ? `${process.env.NEXT_PUBLIC_BASE_URL}/api` : '/api'

const axiosInstance = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Optionally handle token auth here
axiosInstance.interceptors.request.use((config) => {
  return config;
});

export default axiosInstance;

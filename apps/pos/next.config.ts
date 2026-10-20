import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The POS never shows remote product images on the till, so no image hosts are needed yet.
  poweredByHeader: false,
};

export default nextConfig;

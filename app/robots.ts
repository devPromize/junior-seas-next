import type { MetadataRoute } from 'next';

const SITE_URL = 'https://juniorseastech.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Keep private/transactional pages out of search results.
      disallow: ['/api/', '/account/', '/cart', '/checkout', '/wishlist', '/payment/'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}

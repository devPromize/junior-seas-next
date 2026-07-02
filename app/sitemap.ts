import type { MetadataRoute } from 'next';
import { supabaseServer } from '@/lib/supabaseServer';

const SITE_URL = 'https://juniorseastech.com';

// Public, indexable pages. Private/transactional routes (account, cart,
// checkout, wishlist, search results) are intentionally excluded.
const staticRoutes = [
  '',
  '/shop',
  '/about-us',
  '/contact-us',
  '/faqs',
  '/delivery',
  '/returns',
  '/warranty',
  '/cookies',
  '/privacy',
  '/terms',
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = staticRoutes.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: path === '' ? 1 : 0.7,
  }));

  // Add every product page so search engines can discover them directly.
  let productEntries: MetadataRoute.Sitemap = [];
  try {
    const { data } = await supabaseServer
      .from('products')
      .select('id, created_at');
    productEntries = (data || []).map((p: any) => ({
      url: `${SITE_URL}/products/${p.id}`,
      lastModified: p.created_at ? new Date(p.created_at) : now,
      changeFrequency: 'weekly',
      priority: 0.8,
    }));
  } catch {
    // If products can't be fetched, still return the static routes.
  }

  return [...staticEntries, ...productEntries];
}

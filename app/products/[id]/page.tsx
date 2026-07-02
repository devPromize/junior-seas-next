import { fetchSingleProduct } from '@/lib/services/productService';
import ProductDetail from '@/ui/components/ProductDetail';
import type { Metadata } from 'next';
import React from 'react';

interface IParams {
  params: Promise<{ id: string }>;
}

const SITE_URL = 'https://juniorseastech.com';

// Per-product SEO: give each product page its own title, description, and
// social/OG preview instead of inheriting the generic site-wide metadata.
export async function generateMetadata({ params }: IParams): Promise<Metadata> {
  try {
    const { id } = await params;
    const product = await fetchSingleProduct(id);
    if (!product) return { title: 'Product — Junior Seas Technologies' };

    const image =
      product?.variants?.[0]?.image ??
      (Array.isArray(product.images) ? product.images[0] : undefined);
    const description = product.description
      ? String(product.description).slice(0, 160)
      : `Buy ${product.name} at Junior Seas Technologies.`;

    return {
      title: `${product.name} — Junior Seas Technologies`,
      description,
      openGraph: {
        title: product.name,
        description,
        images: image ? [image] : undefined,
        url: `${SITE_URL}/products/${id}`,
        type: 'website',
      },
      twitter: { card: 'summary_large_image' },
    };
  } catch {
    return { title: 'Product — Junior Seas Technologies' };
  }
}

const Page: React.FC<IParams> = async ({ params }) => {
  const { id } = await params;
  const singleProduct = await fetchSingleProduct(id);

  if (!singleProduct) return null;

  return <ProductDetail product={singleProduct} />;
};

export default Page;

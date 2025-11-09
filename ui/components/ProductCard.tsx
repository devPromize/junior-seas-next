'use client';

import { FC, useMemo } from 'react';
import { FaHeart } from 'react-icons/fa';
import { useCart } from '../../context/CartContext';
import { useWishlist } from '../../context/WishListContext';
import { Product } from '@/type';
import Link from 'next/link';

interface Props {
  product: Product;
  sectionKey?: string; // optional, helps with unique keys
}

const ProductCard: FC<Props> = ({
  product,
  sectionKey,
}) => {
  const { addToCart } = useCart();
  const {
    wishlistItems = [],
    addToWishlist,
    removeFromWishlist,
  } = useWishlist();

  // wishlist
  const wishlistIds = useMemo(
    () =>
      new Set(
        wishlistItems.map((it: any) => String(it._id))
      ),
    [wishlistItems]
  );

  const productKey = String(
    product._id ??
      product.id ??
      product.slug ??
      `${sectionKey}-${product.name}`
  );
  const isWishlisted = wishlistIds.has(productKey);

  const toggleWishlist = () => {
    const firstVariant =
      (product.variants && product.variants[0]) || null;
    const item = {
      _id: productKey,
      name: product.name,
      price: String(firstVariant?.price ?? '0'),
      image:
        firstVariant?.image ??
        firstVariant?.images?.[0] ??
        (Array.isArray(product.images)
          ? product.images[0]
          : undefined) ??
        '/placeholder.png',
    };
    if (isWishlisted) {
      removeFromWishlist(item._id);
    } else {
      addToWishlist(item);
    }
  };

  // images
  const mainImage =
    product?.variants?.[0]?.image ??
    product?.variants?.[0]?.images?.[0] ??
    (Array.isArray(product.images)
      ? product.images[0]
      : undefined) ??
    '/placeholder.png';

  // price
  const priceNumbers = (product.variants ?? []).map((v) =>
    Number(v?.price ?? 0)
  );
  const minPrice = priceNumbers.length
    ? Math.min(...priceNumbers)
    : 0;
  const maxPrice = priceNumbers.length
    ? Math.max(...priceNumbers)
    : 0;
  const priceLabel =
    minPrice === maxPrice
      ? `₦${minPrice.toLocaleString()}`
      : `₦${minPrice.toLocaleString()} - ₦${maxPrice.toLocaleString()}`;

  // stock
  const isOutOfStock =
    product.inStock === false ||
    (Array.isArray(product.variants) &&
      product.variants.every(
        (v) => Number(v?.stock ?? 0) === 0
      ));

  return (
    <div
      className="relative flex flex-col justify-between h-full group border rounded p-3 border-(--color-columbia-blue) bg-black/1 
       hover:shadow-(--card-box-shadow) hover:transform-(--card-hover-transform) transition-transform duration-400 ease-in-out"
    >
      {/* Wishlist */}
      <span
        onClick={toggleWishlist}
        title={
          isWishlisted
            ? 'Remove from Wishlist'
            : 'Add to Wishlist'
        }
        className="absolute top-2 right-2 z-10 cursor-pointer group-hover:opacity-100 transition-opacity"
      >
        <FaHeart
          className={
            isWishlisted
              ? 'text-red-500'
              : 'text-gray-400 hover:text-red-500'
          }
        />
      </span>

      {/* Status */}
      {product.status && (
        <span className="absolute top-2 left-2 z-10 bg-gradient-to-r from-purple-500 via-pink-500 to-red-500 text-white text-xs font-semibold px-3 py-1 rounded-full shadow">
          {product.status}
        </span>
      )}

      {/* Out of Stock */}
      {isOutOfStock && (
        <div className="absolute top-0 left-0 w-full h-full bg-black/30 z-20 flex items-center justify-center">
          <span className="bg-red-700/80 text-white whitespace-nowrap text-sm px-10 py-5 rounded-sm shadow-lg">
            Out of Stock
          </span>
        </div>
      )}

      {/* Image */}
      <Link
        href={`/products/${
          product._id ?? product.id ?? product.slug
        }`}
      >
        <img
          src={mainImage}
          alt={product.name}
          className="w-full h-40 object-contain mb-1"
        />
      </Link>

      {/* Name + Price */}
      <h3 className="mt-2 font-medium text-sm line-clamp-2 h-[3rem]">
        {product.name}
      </h3>
      <p className="text-sm text-gray-600">{priceLabel}</p>

      {/* Actions */}
      <div className="mt-3 flex gap-2">
        <Link
          href={`/products/${
            product._id ?? product.id ?? product.slug
          }`}
          className="flex-1 text-center py-1 px-2 text-sm border border-(--color-navyBlue) bg-(--color-white) text-(--color-navyBlue) rounded hover:border-(--color-navyBlue)/90"
        >
          View
        </Link>
        <button
          onClick={() =>
            addToCart({
              ...product,
              _id: productKey,
              quantity: 1,
              price: '',
              image: mainImage,
            })
          }
          disabled={isOutOfStock}
          className={`flex-1 py-1 px-2 text-sm rounded ${
            isOutOfStock
              ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
              : 'bg-(--color-navyBlue) text-white hover:bg-(--color-navyBlue)/90'
          }`}
        >
          Cart
        </button>
      </div>
    </div>
  );
};

export default ProductCard;

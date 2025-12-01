// 'use client';
// import { Product } from '@/type';

// const ProductDetail = ({
//   product,
// }: {
//   product: Product;
// }) => {
//   const mainImage =
//     product?.variants?.[0]?.image ??
//     product?.variants?.[0]?.images?.[0] ??
//     (Array.isArray(product.images)
//       ? product.images[0]
//       : undefined) ??
//     '/placeholder.png';
//   return (
//     <div className="p-6">
//       <img
//         src={mainImage}
//         alt={product.name}
//         className="w-64 mx-auto"
//       />
//       <h1 className="text-2xl font-bold mt-4">
//         {product.name}
//       </h1>
//       <p className="text-lg text-gray-700 mt-2">
//         {product.price}
//       </p>
//       <p className="mt-4">{product.description}</p>
//     </div>
//   );
// };

// export default ProductDetail;





// app/products/ProductDetail.tsx
'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { Product } from '@/type';
import { useCart } from '@/context/CartContext';
import VariantPickerModal from '@/ui/VariantPickerModal';

type Props = { product: Product };

export default function ProductDetail({ product }: Props) {
  const { addToCart } = useCart();

  // ensure variants is an array (server should already ensure this, but safety)
  const variants = Array.isArray(product.variants) ? product.variants : [];

  // default selected variant -> first variant if exists
  const [selectedVariantIndex, setSelectedVariantIndex] = useState<number | null>(
    variants.length ? 0 : null
  );

  const mainImage = variants?.[selectedVariantIndex ?? 0]?.image ??
    (Array.isArray(product.images) ? product.images[0] : undefined) ??
    '/placeholder.png';

  // price label from selected variant or fallback
  const selectedVariant = selectedVariantIndex !== null ? variants[selectedVariantIndex] : null;
  const displayPrice = selectedVariant
    ? Number(selectedVariant.price || 0)
    : // fallback to product.price if you have it (ensure numeric)
      Number((product as any).price || 0);

  const openVariantModal = () => {
    // open modal logic handled by VariantPickerModal local state; we'll just show it
    setShowModal(true);
  };

  const [showModal, setShowModal] = useState(false);

  const handleAddToCart = () => {
    if (!selectedVariant) {
      // if product has no variants, try to add product as single-variant item
      alert('Please select a variant before adding to cart.');
      return;
    }

    const cartItem = {
      _id: `${product.id ?? product._id}::${selectedVariant?.id ?? selectedVariant?.color ?? selectedVariant?.ram ?? Math.random().toString(36).slice(2)}`,
      productId: product.id ?? product._id,
      variantId: selectedVariant?.id ?? null,
      name: product.name,
      price: Number(selectedVariant.price || 0),
      image: selectedVariant.image ?? (Array.isArray(product.images) ? product.images[0] : '/placeholder.png'),
      quantity: 1,
      meta: {
        ram: selectedVariant?.ram,
        rom: selectedVariant?.rom,
        color: selectedVariant?.color,
      },
    };
    addToCart(cartItem);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="flex flex-col items-center">
          <img src={mainImage} alt={product.name} className="w-full max-w-xs object-contain" />
        </div>

        <div>
          <h1 className="text-2xl font-bold">{product.name}</h1>
          <p className="text-lg text-gray-700 mt-2">₦{displayPrice.toLocaleString()}</p>
          <p className="mt-4 whitespace-pre-line">{product.description}</p>

          <div className="mt-6">
            {variants.length === 0 ? (
              <p className="text-sm text-gray-500">No variant data available.</p>
            ) : (
              <>
                <label className="block font-medium mb-2">Select variant</label>
                <div className="flex flex-wrap gap-2">
                  {variants.map((v: any, idx: number) => {
                    const isSelected = idx === selectedVariantIndex;
                    const label = [v.ram, v.rom, v.color].filter(Boolean).join(' • ') || `Variant ${idx + 1}`;
                    return (
                      <button
                        key={idx}
                        onClick={() => setSelectedVariantIndex(idx)}
                        className={`px-3 py-2 border rounded ${isSelected ? 'bg-blue-600 text-white' : 'bg-white'}`}
                      >
                        {label} — ₦{Number(v.price || 0).toLocaleString()}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <div className="mt-6 flex gap-3">
            <button
              onClick={handleAddToCart}
              className="px-4 py-2 bg-green-600 text-white rounded"
            >
              Add to cart
            </button>

            {variants.length > 1 && (
              <button onClick={() => setShowModal(true)} className="px-4 py-2 border rounded">
                Pick variant (modal)
              </button>
            )}
          </div>
        </div>
      </div>

      {showModal && (
        <VariantPickerModal
          product={product}
          onClose={() => setShowModal(false)}
          onConfirm={(variantIndex: number) => {
            setSelectedVariantIndex(variantIndex);
            setShowModal(false);
            // optional: add to cart immediately after picking
            // handleAddToCart();
          }}
        />
      )}
    </div>
  );
}

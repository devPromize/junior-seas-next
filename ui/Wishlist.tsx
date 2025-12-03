'use client';

import { useState } from "react";
import { useWishlist } from "../context/WishListContext";
import { useCart } from "../context/CartContext";
import VariantPickerModal from "@/ui/VariantPickerModal";
import Link from "next/link";

export default function Wishlist() {
  const { wishlistItems, removeFromWishlist, clearWishlist } = useWishlist();
  const { addToCart } = useCart();

  const [selectedProduct, setSelectedProduct] = useState<any>(null);

  // Unified handler for Add to Cart
  const handleAddToCart = (item: any) => {
    const variants = Array.isArray(item.variants) ? item.variants : [];

    if (variants.length === 0) {
      // No variants → add directly
      addToCart({
        _id: item._id,
        productId: item.id ?? item._id,
        variantId: null,
        name: item.name,
        price: Number(item.price || 0),
        image: item.image ?? "/placeholder.png",
        quantity: 1,
        meta: {},
        
      });
      return;
    }

    if (variants.length === 1) {
      // Single variant → add directly
      const v = variants[0];
      addToCart({
        _id: `${item._id}::${v.id ?? v.color ?? Math.random().toString(36).slice(2)}`,
        productId: item.id ?? item._id,
        variantId: v.id ?? null,
        name: item.name,
        price: Number(v.price || item.price || 0),
        image: v.image ?? item.image ?? "/placeholder.png",
        quantity: 1,
        meta: { ram: v.ram, rom: v.rom, color: v.color },
        
      });



      return;
    }

    // Multiple variants → open modal
    setSelectedProduct(item);
  };

  return (
    <div className="max-w-5xl mx-auto p-4">
      {/* Variant Picker Modal */}
      {selectedProduct && (
        <VariantPickerModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onConfirm={(variantIndex) => {
            const v = selectedProduct.variants?.[variantIndex];
            if (!v) return;

            addToCart({
              _id: `${selectedProduct._id}::${v.id ?? v.color ?? Math.random().toString(36).slice(2)}`,
              productId: selectedProduct.id ?? selectedProduct._id,
              variantId: v.id ?? null,
              name: selectedProduct.name,
              price: Number(v.price || selectedProduct.price || 0),
              image: v.image ?? selectedProduct.image ?? "/placeholder.png",
              quantity: 1,
              meta: { ram: v.ram, rom: v.rom, color: v.color },
            });

            setSelectedProduct(null);
          }}
        />
      )}

      <h2 className="text-xl mb-4 font-bold m-5 text-center underline decoration-yellow-500 underline-offset-8">Your Wishlist</h2>

      {wishlistItems.length === 0 ? (
        <p className="text-center py-8">Your wishlist is empty.</p>
      ) : (
        <>
          <div className="grid md:grid-cols-2 gap-4">
            {wishlistItems.map((item) => (
              <div
                key={item._id}
                className="border border-(--color-columbia-blue) bg-black/1 p-4 rounded flex items-center justify-between gap-4"
              >
                <div className="flex items-center space-x-4">
                  <Link href={`/products/${ item._id ?? item.id}`}>
                   <img
                    src={item.image}
                    alt={item.name}
                    className="w-16 h-16 object-cover"
                  />
                 </Link>
                 
                  <div>
                    <h3 className="font-medium">{item.name}</h3>
                    <p className="text-sm text-gray-600">
                      ₦{Number(item.price).toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2 whitespace-nowrap">
                  <button
                    onClick={() => handleAddToCart(item)}
                    className="bg-(--color-navyBlue)/90 text-white hover:bg-(--color-navyBlue)/80 px-3 py-1 rounded text-sm cursor-pointer"
                  >
                    Add to Cart
                  </button>

                  <button
                    onClick={() => removeFromWishlist(item._id)}
                    className="text-red-500 border border-red-500 px-3 py-1 rounded hover:bg-red-50 text-sm cursor-pointer"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={clearWishlist}
            className="mt-6 w-full border border-red-500 text-red-500 py-2 rounded hover:bg-red-50"
          >
            Clear Wishlist
          </button>
        </>
      )}
    </div>
  );
}

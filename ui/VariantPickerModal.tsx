'use client';
import React from 'react';
import { createPortal } from 'react-dom';
import { Product } from '@/type';

type Props = {
  product: Product;
  onClose: () => void;
  onConfirm: (selectedIndex: number) => void;
};

export default function VariantPickerModal({ product, onClose, onConfirm }: Props) {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const [selected, setSelected] = React.useState<number>(0);

  // ❗ Prevent background scrolling
  React.useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  // ensure document exists (for SSR safety)
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
    >
      {/* background overlay */}
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />

      {/* modal card */}
      <div className="relative bg-white rounded-lg shadow-lg max-w-lg w-full p-4 z-10">
        <h3 className="text-lg font-semibold mb-3">Choose variant</h3>
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {variants.map((v: any, idx: number) => (
            <button
              key={idx}
              onClick={() => setSelected(idx)}
              className={`w-full text-left p-2 rounded border border-(--color-columbia-blue)  ${
                selected === idx ? ' bg-(--color-navyBlue) text-white' : 'bg-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <img
                  src={v.image ?? '/placeholder.png'}
                  alt={v.color ?? v.ram ?? ''}
                  className="w-12 h-12 object-cover rounded"
                />
                <div>
                  <div className="font-medium">
                    {(v.ram ? `${v.ram} • ` : '') +
                      (v.rom ? `${v.rom} • ` : '') +
                      (v.color ?? '')}
                  </div>
                  <div className="text-sm text-gray-600">
                    ₦{Number(v.price || 0).toLocaleString()}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1 border rounded">
            Cancel
          </button>
          <button
            onClick={() => onConfirm(selected)}
            className="px-4 py-1  bg-(--color-navyBlue) text-white rounded"
          >
            Select
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

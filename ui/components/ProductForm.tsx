'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import CategorySelect from '@/ui/components/CategorySelect';

type VariantForm = {
  sku?: string;
  ram?: string;
  rom?: string;
  color?: string;
  price?: string | number;
  image?: string;
  stock?: string | number;
};

export type ProductFormValues = {
  name: string;
  brand?: string;
  category?: string;
  description?: string;
  status?: string;
  images: string[];
  variants: VariantForm[];
};

const STATUS_OPTIONS = ['', 'New', 'Hot', 'Popular'];
const emptyVariant: VariantForm = {
  ram: '',
  rom: '',
  color: '',
  price: '',
  image: '',
  stock: '',
};

export default function ProductForm({
  mode,
  productId,
  initial,
}: {
  mode: 'create' | 'edit';
  productId?: string | number;
  initial?: ProductFormValues;
}) {
  const router = useRouter();

  const [name, setName] = useState(initial?.name ?? '');
  const [brand, setBrand] = useState(initial?.brand ?? '');
  const [category, setCategory] = useState(initial?.category ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [status, setStatus] = useState(initial?.status ?? '');
  const [images, setImages] = useState<string[]>(
    initial?.images?.length ? initial.images : ['']
  );
  const [variants, setVariants] = useState<VariantForm[]>(
    initial?.variants?.length ? initial.variants : [{ ...emptyVariant }]
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const setVariant = (i: number, patch: Partial<VariantForm>) =>
    setVariants((prev) =>
      prev.map((v, idx) => (idx === i ? { ...v, ...patch } : v))
    );
  const addVariant = () => setVariants((prev) => [...prev, { ...emptyVariant }]);
  const removeVariant = (i: number) =>
    setVariants((prev) => prev.filter((_, idx) => idx !== i));

  const setImage = (i: number, val: string) =>
    setImages((prev) => prev.map((im, idx) => (idx === i ? val : im)));
  const addImage = () => setImages((prev) => [...prev, '']);
  const removeImage = (i: number) =>
    setImages((prev) => prev.filter((_, idx) => idx !== i));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Product name is required.');
      return;
    }

    const cleanImages = images.map((s) => s.trim()).filter(Boolean);
    const cleanVariants = variants
      .filter((v) => String(v.price ?? '').trim() !== '')
      .map((v) => {
        const out: VariantForm = {
          ram: v.ram || undefined,
          rom: v.rom || undefined,
          color: v.color || undefined,
          image: v.image || undefined,
          price: Number(v.price) || 0,
        };
        if (v.sku) out.sku = v.sku;
        // Stock is only set on create (seeds location_stock). On edit, stock is
        // managed by the per-location stock editor, so we don't send it.
        if (mode === 'create') out.stock = Number(v.stock) || 0;
        return out;
      });

    if (cleanVariants.length === 0) {
      setError('Add at least one variant with a price.');
      return;
    }

    const payload = {
      name: name.trim(),
      brand: brand || null,
      category: category || null,
      description: description || null,
      status: status || null,
      images: cleanImages,
      variants: cleanVariants,
    };

    setSaving(true);
    const res = await fetch(
      mode === 'create'
        ? '/api/admin/products'
        : `/api/admin/products/${productId}`,
      {
        method: mode === 'create' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );
    setSaving(false);

    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j?.message || j?.issues?.[0] || 'Failed to save product.');
      return;
    }

    router.push('/account/admin/products');
    router.refresh();
  }

  const inputCls =
    'w-full border rounded px-3 py-2 bg-gray-50 focus:outline-none focus:border-black';

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <p className="rounded bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">
          {error}
        </p>
      )}

      <div>
        <label className="block text-sm font-medium mb-1">Name *</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputCls}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Brand</label>
          <input
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Category</label>
          <CategorySelect value={category} onChange={setCategory} />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          Badge <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={inputCls}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s || 'None'}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={`${inputCls} h-28`}
        />
      </div>

      {/* Images */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-medium">Image URLs</label>
          <button
            type="button"
            onClick={addImage}
            className="text-sm text-(--color-navyBlue) underline"
          >
            + Add image
          </button>
        </div>
        <p className="text-xs text-gray-400 mb-2">
          Paste ImageKit image URLs (ik.imagekit.io).
        </p>
        <div className="space-y-2">
          {images.map((im, i) => (
            <div key={i} className="flex gap-2">
              <input
                value={im}
                onChange={(e) => setImage(i, e.target.value)}
                placeholder="https://ik.imagekit.io/…"
                className={inputCls}
              />
              {images.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  className="text-red-600 px-2"
                  aria-label="Remove image"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Variants */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-medium">Variants</label>
          <button
            type="button"
            onClick={addVariant}
            className="text-sm text-(--color-navyBlue) underline"
          >
            + Add variant
          </button>
        </div>
        <p className="text-xs text-gray-400 mb-2">
          RAM/ROM/colour are optional (accessories may have none). Price is
          required.
          {mode === 'edit' &&
            ' Stock is managed on the Products & Stock page, per location.'}
        </p>

        <div className="space-y-3">
          {variants.map((v, i) => (
            <div key={i} className="border rounded p-3 bg-white">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <input
                  value={v.ram ?? ''}
                  onChange={(e) => setVariant(i, { ram: e.target.value })}
                  placeholder="RAM (e.g. 8GB)"
                  className={inputCls}
                />
                <input
                  value={v.rom ?? ''}
                  onChange={(e) => setVariant(i, { rom: e.target.value })}
                  placeholder="ROM (e.g. 256GB)"
                  className={inputCls}
                />
                <input
                  value={v.color ?? ''}
                  onChange={(e) => setVariant(i, { color: e.target.value })}
                  placeholder="Colour"
                  className={inputCls}
                />
                <input
                  type="number"
                  value={v.price ?? ''}
                  onChange={(e) => setVariant(i, { price: e.target.value })}
                  placeholder="Price (₦) *"
                  className={inputCls}
                />
                {mode === 'create' && (
                  <input
                    type="number"
                    value={v.stock ?? ''}
                    onChange={(e) => setVariant(i, { stock: e.target.value })}
                    placeholder="Initial stock"
                    className={inputCls}
                  />
                )}
                <input
                  value={v.image ?? ''}
                  onChange={(e) => setVariant(i, { image: e.target.value })}
                  placeholder="Variant image URL"
                  className={inputCls}
                />
              </div>
              {variants.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeVariant(i)}
                  className="mt-2 text-sm text-red-600"
                >
                  Remove variant
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="bg-(--color-navyBlue) text-white px-5 py-2 rounded font-semibold disabled:opacity-60"
        >
          {saving
            ? 'Saving…'
            : mode === 'create'
              ? 'Create product'
              : 'Save changes'}
        </button>
        <button
          type="button"
          onClick={() => router.push('/account/admin/products')}
          className="border px-5 py-2 rounded"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import Container from '@/ui/Container';

type Variant = {
  sku: string;
  ram?: string | null;
  rom?: string | null;
  color?: string | null;
  price?: number | string | null;
  location_quantity: number;
};

type Product = {
  id: number;
  name: string;
  brand?: string | null;
  category?: string | null;
  status?: string | null;
  variants: Variant[];
  total_stock: number;
};

type Location = { id: string; name: string; slug: string };

const variantLabel = (v: Variant) =>
  [v.ram, v.rom, v.color].filter(Boolean).join(' / ') || 'Default';

export default function AdminProductsPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [edits, setEdits] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState<number | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  const key = (pid: number, sku: string) => `${pid}:${sku}`;

  // Load locations once.
  useEffect(() => {
    fetch('/api/admin/locations')
      .then(async (r) => {
        if (!r.ok)
          throw new Error(
            r.status === 401 || r.status === 403
              ? 'You need to be signed in as an admin to view this page.'
              : 'Failed to load locations.'
          );
        return r.json();
      })
      .then((d) => {
        setLocations(d.locations || []);
        if (d.locations?.length) setLocationId(d.locations[0].id);
        else setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  // Load products whenever the selected location changes.
  useEffect(() => {
    if (!locationId) return;
    setLoading(true);
    fetch(`/api/admin/products?location=${locationId}`)
      .then(async (r) => {
        if (!r.ok)
          throw new Error(
            r.status === 401 || r.status === 403
              ? 'You need to be signed in as an admin to view this page.'
              : 'Failed to load products.'
          );
        return r.json();
      })
      .then((d) => {
        setProducts(d.products || []);
        setEdits({});
        setError(null);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [locationId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) =>
      [p.name, p.brand, p.category]
        .filter(Boolean)
        .some((f) => String(f).toLowerCase().includes(q))
    );
  }, [products, search]);

  const setQty = (pid: number, sku: string, value: string) => {
    const qty = Math.max(0, Math.floor(Number(value) || 0));
    setEdits((prev) => ({ ...prev, [key(pid, sku)]: qty }));
  };

  const currentQty = (p: Product, v: Variant) => {
    const k = key(p.id, v.sku);
    return edits[k] !== undefined ? edits[k] : v.location_quantity;
  };

  const productHasEdits = (p: Product) =>
    p.variants.some((v) => edits[key(p.id, v.sku)] !== undefined);

  const saveProduct = async (p: Product) => {
    const updates = p.variants
      .filter((v) => edits[key(p.id, v.sku)] !== undefined)
      .map((v) => ({
        product_id: p.id,
        variant_sku: v.sku,
        quantity: edits[key(p.id, v.sku)],
      }));
    if (!updates.length) return;

    setSaving(p.id);
    const res = await fetch('/api/admin/stock', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ location_id: locationId, updates }),
    });
    setSaving(null);

    if (!res.ok) {
      setError('Failed to save stock. Please try again.');
      return;
    }

    // Reflect saved quantities locally and clear this product's edits.
    setProducts((prev) =>
      prev.map((prod) => {
        if (prod.id !== p.id) return prod;
        const variants = prod.variants.map((v) => {
          const q = edits[key(p.id, v.sku)];
          return q === undefined ? v : { ...v, location_quantity: q };
        });
        const total = variants.reduce(
          (s, v) => s + Number(v.location_quantity || 0),
          0
        );
        return { ...prod, variants, total_stock: total };
      })
    );
    setEdits((prev) => {
      const next = { ...prev };
      p.variants.forEach((v) => delete next[key(p.id, v.sku)]);
      return next;
    });
    setSavedId(p.id);
    setTimeout(() => setSavedId((id) => (id === p.id ? null : id)), 2000);
  };

  return (
    <Container>
      <section className="py-8 max-w-5xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <h1 className="text-2xl font-bold">Products &amp; Stock</h1>

          {locations.length > 0 && (
            <label className="text-sm flex items-center gap-2">
              <span className="text-gray-600">Location</span>
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="border rounded px-3 py-1.5"
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {error && (
          <p className="mb-4 rounded bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
            {error}
          </p>
        )}

        {!error && (
          <input
            type="text"
            placeholder="Search products by name, brand, or category…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border rounded px-3 py-2 mb-4 text-sm"
          />
        )}

        {loading ? (
          <p className="py-10 text-center text-gray-500">Loading…</p>
        ) : (
          !error && (
            <div className="space-y-2">
              {filtered.map((p) => {
                const open = expanded === p.id;
                return (
                  <div key={p.id} className="border rounded">
                    <button
                      onClick={() => setExpanded(open ? null : p.id)}
                      className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
                    >
                      <span className="min-w-0">
                        <span className="font-medium block truncate">
                          {p.name}
                        </span>
                        <span className="text-xs text-gray-500">
                          {p.category || 'uncategorised'}
                          {p.brand ? ` · ${p.brand}` : ''}
                        </span>
                      </span>
                      <span className="flex items-center gap-3 shrink-0">
                        <span
                          className={`text-sm font-semibold ${
                            p.total_stock > 0 ? 'text-green-700' : 'text-red-600'
                          }`}
                        >
                          {p.total_stock} in stock
                        </span>
                        <span className="text-gray-400">{open ? '▲' : '▼'}</span>
                      </span>
                    </button>

                    {open && (
                      <div className="border-t px-4 py-3">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-gray-500">
                              <th className="py-1">Variant</th>
                              <th className="py-1">Price</th>
                              <th className="py-1 w-32">Stock</th>
                            </tr>
                          </thead>
                          <tbody>
                            {p.variants.map((v) => (
                              <tr key={v.sku} className="border-t">
                                <td className="py-2">{variantLabel(v)}</td>
                                <td className="py-2 text-gray-600">
                                  {v.price
                                    ? `₦${Number(v.price).toLocaleString()}`
                                    : '—'}
                                </td>
                                <td className="py-2">
                                  <input
                                    type="number"
                                    min={0}
                                    value={currentQty(p, v)}
                                    onChange={(e) =>
                                      setQty(p.id, v.sku, e.target.value)
                                    }
                                    className="w-24 border rounded px-2 py-1"
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>

                        <div className="flex items-center gap-3 mt-3">
                          <button
                            onClick={() => saveProduct(p)}
                            disabled={!productHasEdits(p) || saving === p.id}
                            className="bg-(--color-navyBlue) text-white text-sm px-4 py-1.5 rounded disabled:opacity-50"
                          >
                            {saving === p.id ? 'Saving…' : 'Save stock'}
                          </button>
                          {savedId === p.id && (
                            <span className="text-green-700 text-sm">Saved ✓</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {filtered.length === 0 && (
                <p className="py-10 text-center text-gray-500">
                  No products match “{search}”.
                </p>
              )}
            </div>
          )
        )}
      </section>
    </Container>
  );
}

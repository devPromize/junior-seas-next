'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { can, naira, type Floor, type Me } from '@/lib/pos';
import {
  buildCatalogue, lookupCode, phonesInStock, search, stockOn,
  type Catalogue, type Item, type Unit,
} from '@/lib/catalogue';
import CameraScanner from '@/components/CameraScanner';

type Tier = 'retail' | 'wholesale';
type Line = { key: string; item: Item; unit?: Unit; qty: number; floorId: number; tier: Tier };
type FoundCustomer = { id: string; name: string; phone: string; purchases: number };

const HEARD_FROM: [string, string][] = [
  ['', 'How did they hear about us?'],
  ['walked_past', 'Walked past the shop'],
  ['returning', 'Bought from us before'],
  ['referral', 'A friend told them'],
  ['instagram', 'Instagram'],
  ['facebook', 'Facebook'],
  ['tiktok', 'TikTok'],
  ['whatsapp', 'WhatsApp'],
  ['google', 'Google'],
  ['other', 'Other'],
];

const CATALOGUE_REFRESH_MS = 3 * 60 * 1000;
const phoneDigits = (p: string) => p.replace(/\D/g, '');
const looksLikePhone = (p: string) => phoneDigits(p).length >= 10;

export default function SellScreen({ me, floor }: { me: Me; floor: Floor }) {
  const supabase = useMemo(() => createClient(), []);
  const searchRef = useRef<HTMLInputElement>(null);

  const [cat, setCat] = useState<Catalogue | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [picking, setPicking] = useState<Item | null>(null);   // a phone model whose IMEI we're choosing
  const [lines, setLines] = useState<Line[]>([]);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);
  const [camera, setCamera] = useState(false);

  // Customer
  const [phone, setPhone] = useState('');
  const [found, setFound] = useState<FoundCustomer | null>(null);
  const [lookup, setLookup] = useState<'idle' | 'looking' | 'done'>('idle');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [heardFrom, setHeardFrom] = useState('');
  const [offers, setOffers] = useState(false);
  const [declined, setDeclined] = useState(false);

  // Order extras
  const [discount, setDiscount] = useState('');
  const [note, setNote] = useState('');
  const [placing, setPlacing] = useState(false);

  const floorName = (id: number) => me.floors.find((f) => f.id === id)?.name ?? '';
  const canWholesale = can(me, 'sales.wholesale');

  // ---------- catalogue ----------
  const loadCatalogue = useCallback(async () => {
    const { data, error } = await supabase.rpc('pos_catalogue');
    if (error) {
      setLoadError(error.message);
      return;
    }
    setCat(buildCatalogue(data));
    setLoadError(null);
  }, [supabase]);

  useEffect(() => {
    loadCatalogue();
    const timer = setInterval(loadCatalogue, CATALOGUE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [loadCatalogue]);

  // A barcode scanner types like a keyboard. Whatever has focus, send typing to the search box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
      if (!typing && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const results = useMemo(() => (cat && query.trim().length >= 2 ? search(cat, query) : []), [cat, query]);

  // ---------- adding to the order ----------
  const say = (kind: 'ok' | 'bad', text: string) => setNotice({ kind, text });

  const addUnit = useCallback((unit: Unit) => {
    if (!cat) return;
    const item = cat.items.get(unit.itemId);
    if (!item) return;
    if (unit.status === 'held') return say('bad', 'This phone is already in another order.');
    if (lines.some((l) => l.unit?.id === unit.id)) return say('bad', 'That phone is already in this order.');
    setLines((prev) => [...prev, { key: unit.id, item, unit, qty: 1, floorId: unit.floorId, tier: 'retail' }]);
    say('ok', `Added ${item.name}`);
    setPicking(null);
  }, [cat, lines]);

  const addItem = useCallback((item: Item) => {
    if (!cat) return;
    if (item.tracksImei) {
      setPicking(item);   // a phone: choose which one, by IMEI
      return;
    }
    // Take it from this floor if it's in stock here, otherwise from the floor that has it.
    let floorId = floor.id;
    if (stockOn(cat, item.id, floor.id) <= 0) {
      const other = me.floors.map((f) => f.id).find((id) => stockOn(cat, item.id, id) > 0);
      if (other) floorId = other;
    }
    setLines((prev) => {
      const same = prev.find((l) => !l.unit && l.item.id === item.id && l.floorId === floorId && l.tier === 'retail');
      if (same) return prev.map((l) => (l === same ? { ...l, qty: l.qty + 1 } : l));
      return [...prev, { key: `${item.id}:${floorId}:${Date.now()}`, item, qty: 1, floorId, tier: 'retail' }];
    });
    say('ok', `Added ${item.name}`);
  }, [cat, floor.id, me.floors]);

  const handleCode = useCallback((code: string) => {
    if (!cat || !code.trim()) return;
    const { unit, item } = lookupCode(cat, code);
    if (unit) addUnit(unit);
    else if (item) addItem(item);
    else return say('bad', `Nothing in the system matches ${code.trim()}.`);
    setQuery('');
  }, [cat, addUnit, addItem]);

  function onSearchEnter(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter' || !cat) return;
    e.preventDefault();
    const { unit, item } = lookupCode(cat, query);
    if (unit || item) return handleCode(query);
    if (results.length === 1) {
      addItem(results[0]);
      setQuery('');
    }
  }

  const changeQty = (key: string, delta: number) =>
    setLines((prev) => prev.flatMap((l) => (l.key !== key ? [l] : l.qty + delta <= 0 ? [] : [{ ...l, qty: l.qty + delta }])));
  const removeLine = (key: string) => setLines((prev) => prev.filter((l) => l.key !== key));
  const toggleTier = (key: string) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, tier: l.tier === 'retail' ? 'wholesale' : 'retail' } : l)));

  const priceOf = (l: Line) => (l.tier === 'wholesale' && l.item.wholesale != null ? l.item.wholesale : l.item.price);
  const total = lines.reduce((sum, l) => sum + priceOf(l) * l.qty, 0);

  // ---------- customer ----------
  useEffect(() => {
    setFound(null);
    if (!looksLikePhone(phone)) {
      setLookup('idle');
      return;
    }
    setLookup('looking');
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc('pos_find_customer', { p_phone: phone });
      setFound(data ?? null);
      if (data?.name) setName(data.name);
      setLookup('done');
    }, 350);
    return () => clearTimeout(t);
  }, [phone, supabase]);

  const customerReady = declined || (looksLikePhone(phone) && name.trim().length > 0);

  function resetCustomer() {
    setPhone(''); setFound(null); setLookup('idle'); setName(''); setEmail('');
    setHeardFrom(''); setOffers(false); setDeclined(false);
  }

  // ---------- place the order ----------
  async function placeOrder() {
    if (!lines.length || !customerReady || placing) return;
    setPlacing(true);
    setNotice(null);
    try {
      let customerId: string | null = null;
      if (!declined) {
        const { data, error } = await supabase.rpc('pos_save_customer', {
          p_phone: phone, p_name: name, p_email: email || null,
          p_heard_from: heardFrom || null, p_consent_marketing: offers,
        });
        if (error) throw error;
        customerId = data.id;
      }
      const discountKobo = Math.round(Number(discount || 0) * 100);
      const { data, error } = await supabase.rpc('pos_place_order', {
        p_floor_id: floor.id,
        p_lines: lines.map((l) =>
          l.unit
            ? { code: l.unit.codes[0], price_tier: l.tier }
            : { item_id: l.item.id, qty: l.qty, floor_id: l.floorId, price_tier: l.tier }),
        p_customer_id: customerId,
        p_customer_declined: declined,
        p_rep_note: note || null,
        p_discount_request_kobo: discountKobo > 0 ? discountKobo : null,
      });
      if (error) throw error;
      say('ok', `Order ${data.receipt_no} sent to the cashier · ${naira(data.total_kobo)}`);
      setLines([]); setDiscount(''); setNote(''); resetCustomer();
      loadCatalogue();   // phones in that order are now held
    } catch (e) {
      say('bad', (e as { message?: string }).message ?? 'Something went wrong. Try again.');
    } finally {
      setPlacing(false);
      searchRef.current?.focus();
    }
  }

  // ---------- screen ----------
  return (
    <main className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-4 px-4 py-4">
      <header className="flex flex-wrap items-center gap-3">
        <Link href="/" className="rounded-lg border border-line bg-panel px-3 py-2 font-medium">← Home</Link>
        <h1 className="text-xl font-bold">Sell</h1>
        <span className="rounded-full bg-brand-soft px-3 py-1 text-sm font-semibold text-brand">{floor.name}</span>
        <span className="ml-auto text-sm text-ink-soft">{me.name}</span>
        <button onClick={() => setCamera(true)} className="rounded-lg border border-line bg-panel px-3 py-2 font-medium">
          Scan with camera
        </button>
      </header>

      {notice && (
        <p role="status" className={`rounded-lg px-4 py-3 font-medium ${notice.kind === 'ok' ? 'bg-brand-soft text-brand' : 'bg-bad-soft text-bad'}`}>
          {notice.text}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* Left: search and scan */}
        <section className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-4">
          <input
            ref={searchRef}
            id="search"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchEnter}
            placeholder={cat ? 'Scan a barcode or IMEI, or type to search' : 'Loading products…'}
            disabled={!cat}
            className="rounded-lg border border-line px-4 py-3 text-lg"
            autoComplete="off"
          />
          {loadError && <p className="rounded-lg bg-bad-soft px-3 py-2 text-bad">{loadError}</p>}
          {cat && (
            <p className="text-xs text-ink-soft">
              {cat.items.size.toLocaleString()} products on this device · updated {new Date(cat.loadedAt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}

          {picking && cat && (
            <div className="rounded-lg border border-brand bg-brand-soft p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="font-semibold">Which {picking.name}? Scan it, or pick its IMEI:</p>
                <button onClick={() => setPicking(null)} className="text-sm underline">Cancel</button>
              </div>
              <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
                {phonesInStock(cat, picking.id).map((u) => (
                  <button key={u.id} onClick={() => addUnit(u)}
                    className="flex justify-between rounded-md bg-panel px-3 py-2 text-left font-mono text-sm">
                    <span>{u.codes.join(' / ') || 'no IMEI'}</span>
                    <span className="text-ink-soft">{floorName(u.floorId)}</span>
                  </button>
                ))}
                {phonesInStock(cat, picking.id).length === 0 && <p className="text-sm">None in stock.</p>}
              </div>
            </div>
          )}

          <ul className="flex flex-col divide-y divide-line">
            {results.map((item) => {
              const here = item.tracksImei
                ? phonesInStock(cat!, item.id).filter((u) => u.floorId === floor.id).length
                : stockOn(cat!, item.id, floor.id);
              const anywhere = item.tracksImei
                ? phonesInStock(cat!, item.id).length
                : me.floors.reduce((s, f) => s + Math.max(0, stockOn(cat!, item.id, f.id)), 0);
              return (
                <li key={item.id}>
                  <button onClick={() => { addItem(item); if (!item.tracksImei) setQuery(''); }}
                    className="flex w-full items-center justify-between gap-3 px-1 py-3 text-left">
                    <span>
                      <span className="block font-medium">{item.name}</span>
                      <span className="text-sm text-ink-soft">
                        {here > 0 ? `${here} here` : 'none here'}{anywhere > here ? ` · ${anywhere} in the shop` : ''}
                        {item.tracksImei ? ' · tracked by IMEI' : ''}
                      </span>
                    </span>
                    <span className="tabular font-semibold">{naira(item.price)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {cat && query.trim().length >= 2 && results.length === 0 && (
            <p className="text-ink-soft">No products match “{query}”.</p>
          )}
        </section>

        {/* Right: the order and the customer */}
        <section className="flex flex-col gap-4">
          <div className="rounded-xl border border-line bg-panel p-4">
            <h2 className="mb-2 font-semibold">Order</h2>
            {lines.length === 0 && <p className="text-ink-soft">Scan or search to add items.</p>}
            <ul className="flex flex-col divide-y divide-line">
              {lines.map((l) => (
                <li key={l.key} className="flex flex-col gap-1 py-2">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">{l.item.name}</span>
                    <span className="tabular font-semibold">{naira(priceOf(l) * l.qty)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
                    {l.unit && <span className="font-mono">IMEI {l.unit.codes[0]}</span>}
                    {l.floorId !== floor.id && <span>from {floorName(l.floorId)}</span>}
                    {!l.unit && (
                      <span className="flex items-center gap-1">
                        <button aria-label="One fewer" onClick={() => changeQty(l.key, -1)} className="h-8 w-8 rounded-md border border-line">−</button>
                        <span className="tabular w-6 text-center text-ink">{l.qty}</span>
                        <button aria-label="One more" onClick={() => changeQty(l.key, 1)} className="h-8 w-8 rounded-md border border-line">+</button>
                      </span>
                    )}
                    {canWholesale && l.item.wholesale != null && (
                      <button onClick={() => toggleTier(l.key)}
                        className={`rounded-full border px-2 py-0.5 ${l.tier === 'wholesale' ? 'border-warn bg-warn-soft text-warn' : 'border-line'}`}>
                        {l.tier === 'wholesale' ? 'Wholesale price' : 'Use wholesale price'}
                      </button>
                    )}
                    <button onClick={() => removeLine(l.key)} className="ml-auto text-bad underline">Remove</button>
                  </div>
                </li>
              ))}
            </ul>
            {lines.length > 0 && (
              <div className="mt-2 flex justify-between border-t border-line pt-2 text-lg font-bold">
                <span>Total</span><span className="tabular">{naira(total)}</span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Customer</h2>
              <button onClick={() => setDeclined((d) => !d)}
                className={`rounded-full border px-3 py-1 text-sm font-medium ${declined ? 'border-warn bg-warn-soft text-warn' : 'border-line'}`}>
                {declined ? 'Customer declined ✓' : 'Customer declined'}
              </button>
            </div>
            {!declined && (
              <>
                <input id="phone" inputMode="tel" placeholder="Phone number *" value={phone}
                  onChange={(e) => setPhone(e.target.value)} className="rounded-lg border border-line px-3 py-3 text-lg" />
                {lookup === 'looking' && <p className="text-sm text-ink-soft">Looking them up…</p>}
                {found && (
                  <p className="rounded-lg bg-brand-soft px-3 py-2 text-sm text-brand">
                    Returning customer · {found.purchases} purchase{found.purchases === 1 ? '' : 's'} before
                  </p>
                )}
                {lookup === 'done' && !found && <p className="text-sm text-ink-soft">New customer</p>}
                <input id="name" placeholder="Name *" value={name} onChange={(e) => setName(e.target.value)}
                  className="rounded-lg border border-line px-3 py-3" />
                {!found && (
                  <>
                    <input id="email" type="email" placeholder="Email (optional)" value={email}
                      onChange={(e) => setEmail(e.target.value)} className="rounded-lg border border-line px-3 py-3" />
                    <select id="heard" value={heardFrom} onChange={(e) => setHeardFrom(e.target.value)}
                      className="rounded-lg border border-line bg-panel px-3 py-3">
                      {HEARD_FROM.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                    </select>
                  </>
                )}
                <label className="flex items-center gap-2 text-sm">
                  <input id="offers" type="checkbox" checked={offers} onChange={(e) => setOffers(e.target.checked)} className="h-5 w-5" />
                  The customer agrees to receive offers on WhatsApp
                </label>
              </>
            )}
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-4">
            <input id="discount" inputMode="numeric" placeholder="Discount promised, ₦ (optional)" value={discount}
              onChange={(e) => setDiscount(e.target.value.replace(/[^\d.]/g, ''))} className="rounded-lg border border-line px-3 py-3" />
            <input id="note" placeholder="Note for the cashier (optional)" value={note}
              onChange={(e) => setNote(e.target.value)} className="rounded-lg border border-line px-3 py-3" />
            <button onClick={placeOrder} disabled={!lines.length || !customerReady || placing}
              className="rounded-lg bg-brand px-4 py-4 text-lg font-bold text-white disabled:opacity-40">
              {placing ? 'Placing order…' : lines.length ? `Place order · ${naira(total)}` : 'Place order'}
            </button>
            {lines.length > 0 && !customerReady && (
              <p className="text-sm text-warn">Add the customer’s phone and name, or tap “Customer declined”.</p>
            )}
          </div>
        </section>
      </div>

      {camera && <CameraScanner onCode={handleCode} onClose={() => setCamera(false)} />}
    </main>
  );
}

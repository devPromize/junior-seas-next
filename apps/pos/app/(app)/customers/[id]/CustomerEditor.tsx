'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Customer } from './page';

const HEARD_FROM: [string, string][] = [
  ['', 'Not recorded'], ['walked_past', 'Walked past the shop'], ['returning', 'Bought from us before'], ['referral', 'A friend told them'],
  ['instagram', 'Instagram'], ['facebook', 'Facebook'], ['tiktok', 'TikTok'], ['whatsapp', 'WhatsApp'], ['google', 'Google'], ['other', 'Other'],
];

// Contact details, where they heard about us, business details, and what they've agreed to.
// Consent changes are timestamped and logged (Nigeria Data Protection Act).
export default function CustomerEditor({ customer: c }: { customer: Customer }) {
  const router = useRouter();
  const [f, setF] = useState({
    name: c.name, phone: c.phone ?? '', email: c.email ?? '', company: c.company ?? '', industry: c.industry ?? '',
    heard_from: c.heard_from ?? '', consent_receipts: c.consent_receipts, consent_marketing: c.consent_marketing, consent_ads: c.consent_ads,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const set = (patch: Partial<typeof f>) => { setF({ ...f, ...patch }); setSaved(false); };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await createClient().rpc('pos_update_customer', { p_id: c.id, p_fields: f });
    setBusy(false);
    if (error) return setError(error.message);
    setSaved(true);
    router.refresh();
  }

  const field = 'rounded-lg border border-line bg-panel px-3 py-2';
  const label = 'flex flex-col gap-1 text-sm font-medium';
  return (
    <form onSubmit={save} className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-4">
      <h2 className="font-semibold">Details</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>Name<input required value={f.name} onChange={(e) => set({ name: e.target.value })} className={field} /></label>
        <label className={label}>Phone<input inputMode="tel" value={f.phone} onChange={(e) => set({ phone: e.target.value })} className={field} /></label>
        <label className={label}>Email<input type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} className={field} /></label>
        <label className={label}>Heard about us
          <select value={f.heard_from} onChange={(e) => set({ heard_from: e.target.value })} className={field}>
            {HEARD_FROM.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className={label}>Company (if buying for a business)<input value={f.company} onChange={(e) => set({ company: e.target.value })} className={field} /></label>
        <label className={label}>Industry<input value={f.industry} onChange={(e) => set({ industry: e.target.value })} placeholder="e.g. School, Hotel" className={field} /></label>
      </div>

      <fieldset className="flex flex-col gap-2 rounded-lg bg-paper p-3 text-sm">
        <legend className="px-1 font-semibold">What they’ve agreed to</legend>
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.consent_receipts} onChange={(e) => set({ consent_receipts: e.target.checked })} className="h-5 w-5" /> Receipts and warranty messages</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.consent_marketing} onChange={(e) => set({ consent_marketing: e.target.checked })} className="h-5 w-5" /> Offers on WhatsApp, SMS or email</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.consent_ads} onChange={(e) => set({ consent_ads: e.target.checked })} className="h-5 w-5" /> Being shown our ads online</label>
        <p className="text-xs text-ink-soft">
          Only tick what the customer actually agreed to.{c.consent_updated_at ? ` Last changed ${new Date(c.consent_updated_at).toLocaleDateString('en-NG', { dateStyle: 'medium' })}.` : ''}
        </p>
      </fieldset>

      {error && <p role="alert" className="rounded-lg bg-bad-soft px-4 py-3 text-bad">{error}</p>}
      {saved && <p className="rounded-lg bg-brand-soft px-4 py-3 text-brand">Saved.</p>}
      <button disabled={busy} className="self-start rounded-lg bg-brand px-5 py-2.5 font-bold text-white disabled:opacity-40">{busy ? 'Saving…' : 'Save details'}</button>
    </form>
  );
}

'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

// Download the current segment as a CSV with HubSpot's column names. Promotional lists should
// only ever contain people who agreed to offers, so that's the default.
export default function ExportButton({ segment }: { segment: string }) {
  const [open, setOpen] = useState(false);
  const [marketingOnly, setMarketingOnly] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setMessage(null);
    const { data, error } = await createClient().rpc('pos_export_customers', { p_segment: segment, p_marketing_only: marketingOnly });
    setBusy(false);
    if (error) return setMessage(error.message);
    const rows = data as Record<string, unknown>[];
    if (!rows.length) return setMessage(marketingOnly ? 'No one in this list has agreed to offers yet.' : 'This list is empty.');
    const headers = Object.keys(rows[0]);
    const cell = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => cell(r[h])).join(','))].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `customers-${segment}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage(`Downloaded ${rows.length} customer${rows.length === 1 ? '' : 's'}. This export has been logged.`);
    setOpen(false);
  }

  if (!open) {
    return (
      <span className="flex items-center gap-2">
        {message && <span className="text-sm text-ink-soft">{message}</span>}
        <button onClick={() => setOpen(true)} className="rounded-lg border border-line bg-panel px-4 py-2.5 font-semibold">Export for CRM</button>
      </span>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-panel p-2">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={marketingOnly} onChange={(e) => setMarketingOnly(e.target.checked)} className="h-4 w-4" />
        Only people who agreed to offers
      </label>
      <button onClick={download} disabled={busy} className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white">
        {busy ? 'Preparing…' : 'Download CSV'}
      </button>
      <button onClick={() => setOpen(false)} className="text-sm underline">Cancel</button>
      {message && <span className="text-sm text-bad">{message}</span>}
    </div>
  );
}

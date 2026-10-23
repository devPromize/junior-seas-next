'use client';

import { useMemo, useState } from 'react';

// Scanning the phones in a delivery, one entry per phone ("IMEI" or "IMEI 1/IMEI 2").
//  - "How many?" shows progress, so nobody stops at 19 of 20.
//  - "Dual SIM" pairs scans: a dual-SIM box has two IMEI barcodes, so 40 scans = 20 phones.
//  - "Paste a list" takes a supplier's list of IMEIs in one go.
//  - Each 15-digit IMEI is checked against its check digit, so mis-scans and typos show up red.

// The IMEI check digit (Luhn): a single wrong digit or swapped pair fails it.
export function imeiLooksValid(code: string): boolean {
  if (!/^\d{15}$/.test(code)) return true;   // serial numbers and odd lengths aren't checked
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    let d = Number(code[i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

export default function PhoneScanner({
  codes, onChange, takenElsewhere,
}: { codes: string[]; onChange: (codes: string[]) => void; takenElsewhere: (code: string) => boolean }) {
  const [expected, setExpected] = useState('');
  const [dual, setDual] = useState(false);
  const [pending, setPending] = useState<string | null>(null);   // dual SIM: IMEI 1 waiting for IMEI 2
  const [scan, setScan] = useState('');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [paste, setPaste] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const already = useMemo(() => new Set(codes.flatMap((c) => c.split('/'))), [codes]);
  const isDuplicate = (code: string) => already.has(code) || code === pending || takenElsewhere(code);

  // Turn raw scanned codes into phone entries, pairing them when dual SIM is on.
  function addCodes(raw: string[]) {
    setProblem(null);
    const fresh: string[] = [];
    let waiting = pending;
    for (const code of raw.map((c) => c.trim()).filter(Boolean)) {
      if (isDuplicate(code) || fresh.some((f) => f.split('/').includes(code)) || code === waiting) {
        setProblem(`${code} is already in this purchase, so it was skipped.`);
        continue;
      }
      if (!dual) fresh.push(code);
      else if (waiting) { fresh.push(`${waiting}/${code}`); waiting = null; }
      else waiting = code;
    }
    setPending(waiting);
    if (fresh.length) onChange([...codes, ...fresh]);
  }

  const target = Number(expected) || 0;
  const bad = codes.flatMap((c) => c.split('/')).filter((c) => !imeiLooksValid(c));
  const field = 'rounded-lg border border-line bg-panel px-3 py-2';

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-paper p-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2 font-medium">
          How many in this delivery?
          <input inputMode="numeric" value={expected} onChange={(e) => setExpected(e.target.value.replace(/\D/g, ''))}
            placeholder="e.g. 20" className={`${field} tabular w-20`} />
        </label>
        <label className="flex items-center gap-2 font-medium">
          <input type="checkbox" checked={dual} onChange={(e) => { setDual(e.target.checked); setPending(null); }} className="h-5 w-5" />
          Dual SIM (two IMEIs on each box)
        </label>
      </div>

      <input value={scan} onChange={(e) => setScan(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCodes([scan]); setScan(''); } }}
        placeholder={pending ? `Now scan IMEI 2 for ${pending}` : dual ? 'Scan IMEI 1 of the next phone' : 'Scan each IMEI or serial, then Enter'}
        className={`${field} font-mono ${pending ? 'border-brand' : ''}`} />

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className={`font-semibold ${target && codes.length === target ? 'text-brand' : ''}`}>
          {target ? `${codes.length} of ${target} phones scanned${codes.length < target ? `, ${target - codes.length} to go` : codes.length === target ? ' ✓' : ''}`
                  : `${codes.length} phone${codes.length === 1 ? '' : 's'} scanned`}
        </span>
        {pending && <span className="text-brand">Waiting for IMEI 2 of {pending}</span>}
        <button type="button" onClick={() => setPasteOpen((o) => !o)} className="underline">Paste a list</button>
        {codes.length > 0 && <button type="button" onClick={() => { onChange([]); setPending(null); }} className="text-bad underline">Clear all</button>}
      </div>
      {target > 0 && codes.length > target && (
        <p className="text-sm font-medium text-warn">
          {codes.length} scanned but you said {target}.{!dual && codes.length === target * 2 ? ' Are these dual-SIM phones? Clear and tick "Dual SIM".' : ''}
        </p>
      )}
      {pasteOpen && (
        <div className="flex flex-col gap-2">
          <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={4}
            placeholder={dual ? 'One phone per line: IMEI 1 and IMEI 2 side by side, or all IMEIs one after another' : 'One IMEI per line (or separated by commas)'}
            className={`${field} font-mono text-sm`} />
          <button type="button" className="self-start rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white"
            onClick={() => { addCodes(paste.split(/[\s,;]+/)); setPaste(''); setPasteOpen(false); }}>
            Add these
          </button>
        </div>
      )}
      {problem && <p className="text-sm text-warn">{problem}</p>}
      {bad.length > 0 && (
        <p className="text-sm font-medium text-bad">
          {bad.length} IMEI{bad.length === 1 ? ' doesn’t' : 's don’t'} pass the IMEI check (shown in red). Usually a mis-scan: remove and scan again.
        </p>
      )}
      <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto">
        {codes.map((c) => (
          <button key={c} type="button" onClick={() => onChange(codes.filter((x) => x !== c))} title="Remove"
            className={`rounded-full border px-3 py-1 font-mono text-xs ${c.split('/').some((x) => !imeiLooksValid(x)) ? 'border-bad bg-bad-soft text-bad' : 'border-line bg-panel'}`}>
            {c} ×
          </button>
        ))}
      </div>
    </div>
  );
}

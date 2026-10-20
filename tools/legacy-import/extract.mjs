// Copies our business data out of the old POS into a private holding area in Supabase
// (schema pos_import), so it can be checked and moved into the new POS tables later.
//
// How it works:
//   1. Opens a Chrome window. You log into the old POS yourself; the script never sees
//      or stores your password.
//   2. It reuses that logged-in session to read the same lists the old POS screens load,
//      one page at a time, with a pause between requests so we never hammer the server.
//   3. Every list is saved to a local JSON file (tools/legacy-import/.data, never committed)
//      and uploaded to Supabase through the pos_import_* database functions.
//
// Read-only: it only ever makes GET requests to the old POS.
//
// Usage:
//   node tools/legacy-import/extract.mjs                 extract everything
//   node tools/legacy-import/extract.mjs --only=products,customers
//   node tools/legacy-import/extract.mjs --no-upload     save files only, skip Supabase

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const DATA_DIR = path.join(HERE, '.data');

const PAGE_SIZE = 500;
const PAUSE_MS = 1200; // pause between requests to be gentle on the old server
const LOGIN_TIMEOUT_MS = 20 * 60 * 1000;
const TODAY = new Date().toISOString().slice(0, 10);

// The old POS keeps one stock count per "business location". These are our floors.
const LOCATIONS = { 1: 'ACCESSORIES', 2: 'SPARE PARTS & REPAIRS', 4: 'ELECTRICAL & ELECTRONIC', 5: 'MOBILE PHONES' };

// Every list we copy. "paged" lists are read 500 rows at a time.
const ENTITIES = {
  products:          { kind: 'paged', url: '/products' },
  sales:             { kind: 'paged', url: '/sells' },
  sale_lines:        { kind: 'paged', url: `/reports/product-sell-report?start_date=2020-01-01&end_date=${TODAY}` },
  sale_returns:      { kind: 'paged', url: '/sell-return' },
  purchases:         { kind: 'paged', url: '/purchases' },
  purchase_lines:    { kind: 'paged', url: `/reports/product-purchase-report?start_date=2020-01-01&end_date=${TODAY}` },
  customers:         { kind: 'paged', url: '/contacts?type=customer' },
  suppliers:         { kind: 'paged', url: '/contacts?type=supplier' },
  stock_adjustments: { kind: 'paged', url: '/stock-adjustments' },
  expenses:          { kind: 'paged', url: '/expenses' },
  staff:             { kind: 'paged', url: '/users' },
  // One row per sellable variation per floor, with its current quantity. For phones each
  // variation is one IMEI, so this is our per-phone stock list.
  stock_by_floor:    { kind: 'stock' },
};

// ---------- small helpers ----------

function loadEnv() {
  const file = path.join(ROOT, '.env.local');
  const env = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    // Keep only the value: drop surrounding quotes and any note typed after it (e.g. "# ...").
    if (m) env[m[1]] = m[2].trim().split(/\s+/)[0].replace(/^["']|["']$/g, '');
  }
  return env;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Turns "<span class='x'>₦ 20,000.00</span>" into "₦ 20,000.00". Keeps everything else as is.
function stripHtml(value) {
  if (typeof value !== 'string' || !value.includes('<')) return value;
  return value.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

// Cleans one row: strips HTML, drops the action-button columns, and makes sure it has an id.
function cleanRow(row, fallbackId) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === 'action' || k === 'mass_delete') continue;
    out[k] = k === 'DT_RowAttr' ? v : stripHtml(v);
  }
  if (out.id == null || out.id === '') {
    // Many lists hide the record id inside the row's link, e.g. {"data-href": ".../sells/123"}.
    const href = row.DT_RowAttr && (row.DT_RowAttr['data-href'] || row.DT_RowAttr.href);
    const m = typeof href === 'string' && href.match(/\/(\d+)(?:\/|\?|$)/);
    out.id = m ? m[1] : fallbackId;
  }
  out.id = String(out.id);
  return out;
}

// ---------- extraction ----------

// Requests are made from inside the logged-in page, so they look exactly like the old POS's
// own screens loading their lists (same cookies, same origin, same headers).
let page;

async function getJson(ctx, base, url) {
  const result = await page.evaluate(async (u) => {
    const res = await fetch(u, {
      headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' },
      credentials: 'same-origin',
    });
    const text = await res.text();
    return { status: res.status, text };
  }, url);
  if (result.status !== 200) throw new Error(`${result.status} on ${url}`);
  let body;
  try { body = JSON.parse(result.text); } catch { throw new Error(`Not JSON on ${url} (logged out?)`); }
  if (body && body.message && !body.data) throw new Error(`Old POS refused ${url}: ${body.message}`);
  return body;
}

async function extractPaged(ctx, base, name, url) {
  const rows = [];
  const seen = new Map(); // counts repeats so identical rows without an id still get unique ids
  const sep = url.includes('?') ? '&' : '?';
  let total = Infinity;
  for (let start = 0; start < total; start += PAGE_SIZE) {
    const body = await getJson(ctx, base, `${url}${sep}draw=1&start=${start}&length=${PAGE_SIZE}`);
    total = Number(body.recordsFiltered ?? body.recordsTotal ?? 0);
    for (const raw of body.data || []) {
      // Rows with no id of their own (report lines) get one built from their contents.
      const key = [raw.invoice_no, raw.ref_no, raw.sub_sku, raw.transaction_date].filter(Boolean).join('|') || JSON.stringify(raw).length;
      const n = (seen.get(key) || 0) + 1;
      seen.set(key, n);
      rows.push(cleanRow(raw, `${key}#${n}`));
    }
    process.stdout.write(`\r  ${name}: ${rows.length} / ${total}   `);
    if (!body.data || body.data.length === 0) break;
    await sleep(PAUSE_MS);
  }
  process.stdout.write('\n');
  return { rows, expected: total };
}

async function extractStock(ctx, base) {
  const rows = [];
  for (const [locId, floor] of Object.entries(LOCATIONS)) {
    const body = await getJson(ctx, base, `/products/list?term=&location_id=${locId}`);
    const list = Array.isArray(body) ? body : body.data || [];
    for (const v of list) {
      rows.push({ ...v, id: `${locId}:${v.variation_id}`, location_id: Number(locId), floor });
    }
    console.log(`  stock_by_floor: ${floor} → ${list.length} variations`);
    await sleep(PAUSE_MS);
  }
  return { rows, expected: rows.length };
}

// ---------- upload ----------

async function upload(supabase, runId, entity, rows) {
  const CHUNK = 500;
  let loaded = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { data, error } = await supabase.rpc('pos_import_load', {
      p_run_id: runId, p_entity: entity, p_rows: rows.slice(i, i + CHUNK),
    });
    if (error) throw new Error(`Upload of ${entity} failed: ${error.message}`);
    loaded += data;
  }
  return loaded;
}

// ---------- main ----------

async function main() {
  const args = process.argv.slice(2);
  const only = (args.find((a) => a.startsWith('--only=')) || '').replace('--only=', '').split(',').filter(Boolean);
  const noUpload = args.includes('--no-upload');
  const names = only.length ? only : Object.keys(ENTITIES);
  for (const n of names) if (!ENTITIES[n]) throw new Error(`Unknown list "${n}". Choose from: ${Object.keys(ENTITIES).join(', ')}`);

  const env = loadEnv();
  const base = env.LEGACY_POS_URL;
  if (!base) throw new Error('LEGACY_POS_URL is missing from .env.local');

  let supabase = null;
  let runId = null;
  if (!noUpload) {
    // Take only the address itself, in case a note was typed after it on the same line.
    const url = (env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || '').split(/\s+/)[0];
    if (!url || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase URL or service role key missing from .env.local');
    supabase = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data, error } = await supabase.rpc('pos_import_start_run', { p_notes: `lists: ${names.join(', ')}` });
    if (error) throw new Error(`Could not start an import run: ${error.message}`);
    runId = data;
  }

  // A separate Chrome profile just for this tool, so it never disturbs your normal browser.
  const ctx = await chromium.launchPersistentContext(path.join(DATA_DIR, 'browser-profile'), {
    channel: 'chrome', headless: false, viewport: { width: 1200, height: 800 },
  });
  page = ctx.pages()[0] || (await ctx.newPage());
  await page.goto(base + '/home');
  if (!page.url().includes('/home')) {
    console.log('\nPlease log into the old POS in the Chrome window that just opened.');
    console.log('The script continues by itself once the dashboard loads.\n');
    await page.waitForURL(/\/home/, { timeout: LOGIN_TIMEOUT_MS });
  }
  console.log(`Logged in. Run ${runId ?? '(files only)'} starting.\n`);

  const runDir = path.join(DATA_DIR, `run-${runId ?? Date.now()}`);
  fs.mkdirSync(runDir, { recursive: true });
  const summary = [];

  for (const name of names) {
    const def = ENTITIES[name];
    try {
      const { rows, expected } = def.kind === 'stock'
        ? await extractStock(ctx, base)
        : await extractPaged(ctx, base, name, def.url);
      fs.writeFileSync(path.join(runDir, `${name}.json`), JSON.stringify(rows));
      const loaded = supabase ? await upload(supabase, runId, name, rows) : 0;
      summary.push({ list: name, expected, extracted: rows.length, uploaded: supabase ? loaded : 'skipped' });
    } catch (err) {
      // One failing list shouldn't stop the others. It's reported at the end.
      console.log(`\n  ${name}: FAILED (${err.message})`);
      summary.push({ list: name, expected: '?', extracted: 0, uploaded: `failed: ${err.message}` });
    }
    await sleep(PAUSE_MS);
  }

  if (supabase) await supabase.rpc('pos_import_finish_run', { p_run_id: runId });
  await ctx.close();

  console.log('\nDone.');
  console.table(summary);
  const short = summary.filter((s) => s.extracted < s.expected);
  if (short.length) console.log('These lists came back shorter than expected:', short.map((s) => s.list).join(', '));
}

main().catch((err) => {
  console.error('\nStopped:', err.message);
  process.exit(1);
});

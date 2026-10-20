// Builds the printable "please confirm" workbook from the import review list:
// one sheet per floor, with blank columns for staff to fill in what's really there.
//
// Input:  tools/legacy-import/.data/confirm-list.txt  (floor|problem|product|imei|old qty)
// Output: tools/legacy-import/.data/Stock-confirmation-sheet.xlsx
// Both stay in .data, which is never committed.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(HERE, '.data');

const FLOORS = {
  ground: 'Ground floor',
  first: 'First floor',
  second: 'Second floor',
  unknown: 'Floor not set',
};

// What each problem means, and what we're asking staff to do about it.
const PROBLEMS = {
  stock_below_zero: 'Shows below zero. Please count how many are really here.',
  phone_below_zero: 'Phone shows below zero. Is this IMEI in the store?',
  phone_counted_more_than_once: 'One IMEI counted more than once. Is there exactly one phone?',
  duplicate_imei: 'Same IMEI saved twice. Find the phone and confirm the correct model.',
  invalid_imei: 'IMEI or serial looks wrong. Check the label on the box and write the correct one.',
  inactive_product_with_stock: 'Marked inactive in the old system but still shows stock. Is it a real item here?',
  duplicate_barcode: 'Two products share one barcode. Which one is correct?',
};

const rows = fs.readFileSync(path.join(DATA, 'confirm-list.txt'), 'utf8')
  .split(/\r?\n/).filter(Boolean)
  .map((line) => {
    const [floor, problem, product, imei, qty] = line.split('|');
    return { floor, problem, product, imei, qty: qty === '' ? '' : Number(qty) };
  });

const wb = new ExcelJS.Workbook();
wb.creator = 'Junior Seas POS';
wb.created = new Date();

for (const [code, title] of Object.entries(FLOORS)) {
  const list = rows.filter((r) => r.floor === code);
  if (!list.length) continue;

  const ws = wb.addWorksheet(title, {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
    headerFooter: { oddFooter: `${title} · page &P of &N` },
    views: [{ state: 'frozen', ySplit: 3 }],
  });

  ws.mergeCells('A1:H1');
  ws.getCell('A1').value = `Stock to confirm · ${title} · ${list.length} items`;
  ws.getCell('A1').font = { bold: true, size: 14 };
  ws.mergeCells('A2:H2');
  ws.getCell('A2').value = 'Check each item in the store and write what is really there. Do not change anything in the old system yet.';
  ws.getCell('A2').font = { italic: true, color: { argb: 'FF555555' } };

  ws.columns = [
    { key: 'n', width: 5 },
    { key: 'product', width: 44 },
    { key: 'imei', width: 20 },
    { key: 'qty', width: 12 },
    { key: 'problem', width: 52 },
    { key: 'actual', width: 13 },
    { key: 'by', width: 14 },
    { key: 'notes', width: 30 },
  ];
  const header = ws.getRow(3);
  header.values = ['#', 'Product', 'IMEI / serial', 'Old system shows', 'What to check', 'Actual count', 'Checked by', 'Notes'];
  header.font = { bold: true };
  header.alignment = { vertical: 'middle', wrapText: true };
  header.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF3' } };
    c.border = { bottom: { style: 'medium' } };
  });

  // Group the same kind of problem together so staff can work through one type at a time.
  const order = Object.keys(PROBLEMS);
  list.sort((a, b) => order.indexOf(a.problem) - order.indexOf(b.problem) || a.product.localeCompare(b.product));

  list.forEach((r, i) => {
    const row = ws.addRow({
      n: i + 1, product: r.product, imei: r.imei, qty: r.qty,
      problem: PROBLEMS[r.problem] || r.problem, actual: '', by: '', notes: '',
    });
    row.alignment = { vertical: 'top', wrapText: true };
    row.getCell('imei').numFmt = '@';
    row.eachCell({ includeEmpty: true }, (c) => { c.border = { bottom: { style: 'hair' } }; });
    for (const k of ['actual', 'by', 'notes']) {
      row.getCell(k).border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    }
  });
  ws.pageSetup.printTitlesRow = '3:3';
}

const out = path.join(DATA, 'Stock-confirmation-sheet.xlsx');
await wb.xlsx.writeFile(out);
const counts = Object.entries(FLOORS).map(([c, t]) => `${t}: ${rows.filter((r) => r.floor === c).length}`).join(', ');
console.log(`Saved ${out}\n${rows.length} items (${counts})`);

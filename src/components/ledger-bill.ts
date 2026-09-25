'use client';

import { formatINR } from '@/lib/money';
import { todayISO } from '@/lib/dates';

/*
 * THE LENDING BILL.
 *
 * One person's lent-and-borrowed history as a PDF: who, the net balance as the
 * inspector states it, and every entry, oldest first, numbered. Nothing here
 * computes money — the balance and the Gave/Got totals arrive from the same
 * response the inspector draws, so the page and the paper cannot disagree.
 *
 * Laid out like a payslip: a letterhead, the balance written as the equation
 * it is (net = got − gave, or the other way round), a column of particulars on
 * the left, and the entries as a bracketed section that ends in its totals.
 *
 * Everything heavy is fetched on the click, not the page load: jsPDF and its
 * table plugin, the logo, and the font. The font matters — the PDF standard
 * fonts have no ₹, so Noto Sans (trimmed to Latin + ₹, OFL, in /public/fonts)
 * is embedded. It has no arrows either, so the direction marks are drawn.
 *
 * Printed on white, so the colours are the Paper theme's, not Obsidian's.
 */

export type LedgerBillEntry = {
  id: string;
  direction: 'out' | 'in';
  amountMinor: number;
  entryDate: string;
  note: string | null;
};

export type LedgerBillInput = {
  name: string;
  relationship: string;
  balanceMinor: number;
  lentMinor: number;
  borrowedMinor: number;
  /** As the inspector holds them — newest first. */
  entries: LedgerBillEntry[];
};

type RGB = [number, number, number];
type Doc = import('jspdf').jsPDF;
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;

/* The Paper theme, resolved to sRGB. */
/*
 * Light, the way a payslip is: every figure in near-black ink, and colour kept
 * to the accents — gradient bars, the bracket, the arrows, and washes so pale
 * they read as a tint. Each gradient has its own start and end, so "got" runs
 * lime into green and "gave" runs orange into magenta, and a tinted row fades
 * in from white rather than sitting as a block.
 */
const INK = hex('#1b221d');
const MUTED = hex('#6b746b');
const FAINT = hex('#9aa39a');
const RED = hex('#e5484d'); // only for the small "you owe" and the ↑
const GREEN = hex('#22b14c'); // only for the small "owed to you" and the ↓
const WHITE: RGB = [255, 255, 255];
const RULE = hex('#e6ebe3');
/* gradient stops */
const GOT_FROM = hex('#5fe06a');
const GOT_TO = hex('#1ea84a');
const GAVE_FROM = hex('#ff5b2e');
const GAVE_TO = hex('#b3179c');
const MINT = hex('#ebfaf0');
const GOT_WASH = hex('#e9f9ee');
const GAVE_WASH = hex('#fdf0f1');
const OWE_WASH = hex('#fdeaee');
const OWED_WASH = hex('#e3f7e9');
const SETTLED_WASH = hex('#f1f3ef');
const BAND = hex('#f4fcf6'); // every other entry row
/* the decorative shapes */
const LEAF = hex('#e3f7e8');
const BLUSH = hex('#fde4e9');
const PEACH = hex('#fff0e6');

const PAGE_W = 595.28; // A4, points
const PAGE_H = 841.89;
const M = 44;
const SIDE_W = 128; // the particulars column
const MAIN_X = M + SIDE_W + 18; // where the statement proper begins
const MAIN_W = PAGE_W - M - MAIN_X;
const FOOT = 60; // reserved at the bottom of every page

export async function downloadLedgerBill(input: LedgerBillInput): Promise<void> {
  const [{ jsPDF, GState }, autoTableModule, regular, bold, logo] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    fetchBase64('/fonts/NotoSans-Regular.ttf'),
    fetchBase64('/fonts/NotoSans-Bold.ttf'),
    logoDataUrl(),
  ]);
  const autoTable = autoTableModule.default;

  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  doc.addFileToVFS('NotoSans-Regular.ttf', regular);
  doc.addFont('NotoSans-Regular.ttf', 'NotoSans', 'normal');
  doc.addFileToVFS('NotoSans-Bold.ttf', bold);
  doc.addFont('NotoSans-Bold.ttf', 'NotoSans', 'bold');

  const font = (weight: 'normal' | 'bold', size: number, color: RGB) => {
    doc.setFont('NotoSans', weight);
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };

  const today = todayISO();
  // The inspector's list is newest-first (oldest-first reversed), so reversing
  // it again gives the order it was recorded in, same-day ties included.
  const rows = [...input.entries].reverse();
  const bal = input.balanceMinor;
  const tone: RGB = bal === 0 ? INK : bal > 0 ? GREEN : RED;
  const toneWash: RGB = bal === 0 ? SETTLED_WASH : bal > 0 ? OWED_WASH : OWE_WASH;
  const netPhrase = bal === 0 ? 'settled' : bal > 0 ? 'owed to you' : 'you owe';
  const lentCount = rows.filter((e) => e.direction === 'out').length;
  const gotCount = rows.length - lentCount;

  /* ---------- letterhead ---------- */
  const logoH = 26;
  const logoW = (logoH * 900) / 409; // the mark's intrinsic ratio
  doc.addImage(logo, 'PNG', M, 50, logoW, logoH, undefined, 'FAST');
  font('bold', 14, INK);
  doc.text('Money Flow', M + logoW + 10, 68);

  const headX = PAGE_W - M - 170;
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.8);
  doc.line(headX, 46, headX, 82);
  font('bold', 11, INK);
  const title = `Lending statement: ${input.name}`;
  doc.setFontSize(fitSize(doc, title, 158, 11, 8));
  doc.text(title, headX + 12, 61);
  font('normal', 8, MUTED);
  doc.text(`Generated ${longDate(today)} by Money Flow`, headX + 12, 75);

  /* ---------- pale shapes either side of the equation, as the reference has ---------- */
  // Shape, not information, so barely there. On the left, a green bar and a
  // red one crossed over a peach corner, translucent so the crossing tints;
  // on the right, a green slant and a red wedge.
  doc.saveGraphicsState();
  doc.setGState(new GState({ opacity: 0.85 }));
  const sx = M;
  const sy = 110;
  const sh = 66;
  doc.setFillColor(...PEACH);
  doc.triangle(sx, sy + 8, sx, sy + sh, sx + 40, sy + sh, 'F');
  doc.setFillColor(...LEAF);
  doc.lines([[30, 0], [44, sh], [-30, 0]], sx + 8, sy, [1, 1], 'F', true);
  doc.setFillColor(...BLUSH);
  doc.lines([[30, 0], [-44, sh], [-30, 0]], sx + 70, sy, [1, 1], 'F', true);
  doc.restoreGraphicsState();

  doc.saveGraphicsState();
  doc.setGState(new GState({ opacity: 0.85 }));
  doc.setFillColor(...LEAF);
  doc.lines([[34, 0], [-40, 58], [-34, 0]], PAGE_W - M - 58, 118, [1, 1], 'F', true);
  doc.setFillColor(...BLUSH);
  doc.triangle(PAGE_W - M, 118, PAGE_W - M, 176, PAGE_W - M - 34, 176, 'F');
  doc.restoreGraphicsState();

  /* ---------- the balance, as the equation it is ---------- */
  // Owing is got − gave; being owed is gave − got. The larger side goes
  // first with a +, so the equation reads the way the balance was reached.
  const eqY = 128;
  font('normal', 8.5, MUTED);
  doc.text('Net balance', MAIN_X, eqY);
  font('bold', 15, INK);
  const net = bal === 0 ? 'Settled' : formatINR(Math.abs(bal));
  doc.text(net, MAIN_X, eqY + 19);
  font('bold', 8, tone);
  doc.text(bal === 0 ? 'nothing open' : netPhrase, MAIN_X, eqY + 32);

  const netW = Math.max(
    (doc.setFont('NotoSans', 'bold'), doc.setFontSize(15), doc.getTextWidth(net)),
    (doc.setFontSize(8.5), doc.getTextWidth('Net balance')),
  );
  const eqX = MAIN_X + netW + 16;
  font('normal', 16, MUTED);
  doc.text('=', eqX, eqY + 16);

  const gotFirst = bal <= 0;
  const terms = [
    { label: 'Got', value: input.borrowedMinor, from: GOT_FROM, to: GOT_TO, sign: gotFirst ? '+' : '-' },
    { label: 'Gave', value: input.lentMinor, from: GAVE_FROM, to: GAVE_TO, sign: gotFirst ? '-' : '+' },
  ];
  if (!gotFirst) terms.reverse();
  let tx = eqX + 22;
  for (const t of terms) {
    gradRect(doc, tx, eqY - 9, 2.8, 34, t.from, t.to, 'v');
    font('normal', 8.5, MUTED);
    doc.text(t.label, tx + 9, eqY);
    font('bold', 12.5, INK);
    const v = `${t.sign} ${formatINR(t.value)}`;
    doc.text(v, tx + 9, eqY + 18);
    tx += 9 + Math.max(doc.getTextWidth(v), 40) + 26;
  }

  /* ---------- particulars, down the left ---------- */
  const first = rows[0]?.entryDate;
  const last = rows[rows.length - 1]?.entryDate;
  const particulars: [string, string][] = [
    ['Contact', input.name],
    ['Relationship', capitalise(input.relationship)],
    ['Period start', first ? longDate(first) : '—'],
    ['Period end', last ? longDate(last) : '—'],
    ['Entries', String(rows.length)],
    ['Money you gave', `${lentCount} ${lentCount === 1 ? 'entry' : 'entries'} · ${formatINR(input.lentMinor)}`],
    ['Money you got', `${gotCount} ${gotCount === 1 ? 'entry' : 'entries'} · ${formatINR(input.borrowedMinor)}`],
    ['Balance', bal === 0 ? 'Settled' : `${formatINR(Math.abs(bal))} ${netPhrase}`],
    ['Generated on', longDate(today)],
  ];
  let py = 196;
  for (const [label, value] of particulars) {
    font('normal', 8.5, MUTED);
    doc.text(label, M, py);
    font('bold', 9.5, INK);
    const lines = value.split('\n').flatMap((l) => doc.splitTextToSize(l, SIDE_W) as string[]);
    doc.text(lines, M, py + 14);
    py += 14 + lines.length * 12.5 + 16;
  }

  /* ---------- the entries, as a bracketed section ---------- */
  const secY = 196;
  font('bold', 11.5, INK);
  doc.text('Entries', MAIN_X + 30, secY + 4);
  const titleW = doc.getTextWidth('Entries');
  diamond(doc, MAIN_X + 30 + titleW + 10, secY, 3.6, GOT_FROM);
  font('normal', 8, MUTED);
  doc.text('Every amount lent and borrowed, oldest first', MAIN_X + 30 + titleW + 21, secY + 3.5);

  const tableX = MAIN_X + 20;
  const tableW = PAGE_W - M - tableX;
  const firstPage = doc.getNumberOfPages();

  /*
   * The amount column on a fixed grid, so every row lines up with the next:
   * a label slot as wide as "gave" (the longer word) at the right edge, every
   * figure ending at the same line before it, and the arrows in one column
   * set by the widest figure in the statement — not each hugging its own.
   */
  const AMT = { pad: 10, labelGap: 7, arrowGap: 11, arrowW: 7 };
  font('normal', 7.5, FAINT);
  const labelSlot = doc.getTextWidth('gave');
  font('bold', 10, INK);
  const widestAmount = Math.max(...rows.map((e) => doc.getTextWidth(formatINR(e.amountMinor))));
  const amountColW = Math.max(
    112,
    AMT.pad * 2 + AMT.arrowW + AMT.arrowGap + widestAmount + AMT.labelGap + labelSlot,
  );

  autoTable(doc, {
    startY: secY + 22,
    margin: { left: tableX, right: M, top: 70, bottom: FOOT + 10 },
    head: [['S.No', 'Date', 'Subject', 'Amount']],
    // The amount is drawn by hand (arrow, figure and a small label in two
    // colours); its cell text is only there to size the column.
    body: rows.map((e, i) => [
      String(i + 1),
      longDate(e.entryDate),
      e.note?.trim() || (e.direction === 'out' ? 'Lent' : 'Borrowed'),
      `${formatINR(e.amountMinor)} gave`,
    ]),
    theme: 'plain',
    // A row moves whole to the next page rather than splitting: a bill line
    // cut in half reads as two, and the continued half has no entry behind it.
    rowPageBreak: 'avoid',
    styles: {
      font: 'NotoSans',
      fontSize: 9.5,
      textColor: INK,
      cellPadding: { top: 8, bottom: 8, left: 7, right: 7 },
      valign: 'middle',
    },
    headStyles: {
      fillColor: false,
      textColor: INK,
      fontStyle: 'bold',
      fontSize: 8.5,
    },
    columnStyles: {
      0: { cellWidth: 38, textColor: MUTED },
      1: { cellWidth: 76, textColor: MUTED, fontSize: 9 },
      3: { cellWidth: amountColW, halign: 'right', cellPadding: { top: 8, bottom: 8, left: AMT.pad, right: AMT.pad } },
    },
    didParseCell: (d) => {
      // Both drawn by hand in didDrawCell; the header centres on what sits
      // under it, not on the cell, whose spare width is all on the left.
      if (d.column.index === 3) d.cell.text = [''];
    },
    // The header's wash runs mint into white across the whole row; each cell
    // paints its own slice of that one gradient, before its text goes on.
    // Every other entry row carries a fainter version of the same wash.
    willDrawCell: (d) => {
      const band = d.section === 'body' && d.row.index % 2 === 1;
      // Painted once per row, from its first cell, so no cell edge can show.
      if ((d.section !== 'head' && !band) || d.column.index !== 0) return;
      const rowW = Object.values(d.row.cells).reduce((w, c) => w + c.width, 0);
      gradRect(doc, d.cell.x, d.cell.y, rowW, d.cell.height, band ? BAND : MINT, mix(band ? BAND : MINT, WHITE, 0.9), 'h');
    },
    didDrawCell: (d) => {
      if (d.column.index !== 3) return;
      const mid = d.cell.y + d.cell.height / 2;
      const labelX = d.cell.x + d.cell.width - AMT.pad - labelSlot; // label slot, left-aligned
      const amountRight = labelX - AMT.labelGap; // every figure ends here
      const arrowX = amountRight - widestAmount - AMT.arrowGap; // one column of arrows
      if (d.section === 'head') {
        // Centred over arrow, figure and label together.
        font('bold', 8.5, INK);
        doc.text('Amount', (arrowX - AMT.arrowW / 2 + labelX + labelSlot) / 2, mid + 3, { align: 'center' });
        return;
      }
      if (d.section !== 'body') return;
      const e = rows[d.row.index];
      if (!e) return;
      const out = e.direction === 'out';

      font('normal', 7.5, FAINT);
      doc.text(out ? 'gave' : 'got', labelX, mid + 3);
      font('bold', 10, INK);
      doc.text(formatINR(e.amountMinor), amountRight, mid + 3.5, { align: 'right' });
      drawArrow(doc, arrowX, mid, out, out ? RED : GREEN);
    },
  });

  /* ---------- totals, as the reference closes a section ---------- */
  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  if (y + 3 * 26 + 10 > PAGE_H - FOOT - 10) {
    doc.addPage();
    y = 70;
  }
  const totalsX = tableX + tableW * 0.38;
  const totals: { label: string; value: string; wash: RGB; strong?: boolean }[] = [
    { label: 'Total gave', value: `- ${formatINR(input.lentMinor)}`, wash: GAVE_WASH },
    { label: 'Total got', value: `+ ${formatINR(input.borrowedMinor)}`, wash: GOT_WASH },
    {
      label: 'Net balance',
      value: bal === 0 ? 'Settled' : `${formatINR(Math.abs(bal))} ${netPhrase}`,
      wash: toneWash,
      strong: true,
    },
  ];
  for (const t of totals) {
    const h = t.strong ? 30 : 24;
    gradRect(doc, totalsX, y, PAGE_W - M - totalsX, h, WHITE, t.wash, 'h');
    font('bold', t.strong ? 10.5 : 9, INK);
    doc.text(t.label, totalsX + 12, y + h / 2 + 3.5);
    font('bold', t.strong ? 11.5 : 9.5, INK);
    doc.text(t.value, PAGE_W - M - 12, y + h / 2 + 3.5, { align: 'right' });
    y += h + 2;
  }
  const endPage = doc.getNumberOfPages();
  const endY = y - 2;

  // The bracket down the left of the section, across however many pages it
  // runs to: curved in at the title, then one gradient from lime into green
  // spread over the whole run, and a diamond at its end.
  const segs: { p: number; top: number; bottom: number }[] = [];
  for (let p = firstPage; p <= endPage; p++) {
    segs.push({
      p,
      top: p === firstPage ? secY + 10 : 60,
      bottom: p === endPage ? endY : PAGE_H - FOOT - 8,
    });
  }
  const run = segs.reduce((n, g) => n + (g.bottom - g.top), 0) || 1;
  let done = 0;
  for (const g of segs) {
    doc.setPage(g.p);
    if (g.p === firstPage) {
      doc.setDrawColor(...GOT_FROM);
      doc.setLineWidth(1.4);
      doc.lines([[-12, 0], [-5.5, 0, -10, 4.5, -10, 10]], MAIN_X + 22, secY);
    }
    const len = g.bottom - g.top;
    gradLine(doc, MAIN_X, g.top, g.bottom, mix(GOT_FROM, GOT_TO, done / run), mix(GOT_FROM, GOT_TO, (done + len) / run), 1.4);
    done += len;
    if (g.p === endPage) diamond(doc, MAIN_X, g.bottom + 4, 3.8, GOT_TO);
  }

  /* ---------- footer, every page ---------- */
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    font('normal', 7.5, MUTED);
    doc.text(`Page ${p} of ${pages}`, M, PAGE_H - 30);
    doc.text(
      'A computer-generated statement from Money Flow — figures as recorded in the app.',
      PAGE_W - M,
      PAGE_H - 30,
      { align: 'right' },
    );
  }

  doc.save(`moneyflow-ledger-${slug(input.name)}-${today}.pdf`);
}

/** ↑ for money that went out (lent), ↓ for money that came in (borrowed). */
function drawArrow(doc: Doc, x: number, cy: number, up: boolean, color: RGB) {
  const h = 9;
  const top = cy - h / 2;
  const bottom = cy + h / 2;
  doc.setDrawColor(...color);
  doc.setFillColor(...color);
  doc.setLineWidth(1.3);
  if (up) {
    doc.line(x, bottom, x, top + 3);
    doc.triangle(x - 3.2, top + 3.6, x + 3.2, top + 3.6, x, top, 'F');
  } else {
    doc.line(x, top, x, bottom - 3);
    doc.triangle(x - 3.2, bottom - 3.6, x + 3.2, bottom - 3.6, x, bottom, 'F');
  }
}

const mix = (a: RGB, b: RGB, t: number): RGB =>
  a.map((v, i) => Math.round(v + (b[i] - v) * Math.min(1, Math.max(0, t)))) as RGB;

/**
 * A linear gradient fill, drawn as fine strips of interpolated colour. jsPDF's
 * native shadings need its advanced API; strips print identically and cost a
 * few kilobytes. Each strip overlaps the next by a hair so no seam shows.
 */
function gradRect(doc: Doc, x: number, y: number, w: number, h: number, from: RGB, to: RGB, dir: 'h' | 'v') {
  const len = dir === 'h' ? w : h;
  const steps = Math.max(6, Math.min(120, Math.ceil(len / 1.5)));
  for (let i = 0; i < steps; i++) {
    doc.setFillColor(...mix(from, to, steps === 1 ? 0 : i / (steps - 1)));
    const a = (len * i) / steps;
    const size = Math.min(len / steps + 0.5, len - a);
    if (dir === 'h') doc.rect(x + a, y, size, h, 'F');
    else doc.rect(x, y + a, w, size, 'F');
  }
}

/** A vertical line whose colour runs from `from` at the top to `to` at the bottom. */
function gradLine(doc: Doc, x: number, top: number, bottom: number, from: RGB, to: RGB, width: number) {
  const steps = Math.max(2, Math.ceil((bottom - top) / 3));
  doc.setLineWidth(width);
  for (let i = 0; i < steps; i++) {
    doc.setDrawColor(...mix(from, to, i / (steps - 1)));
    const a = top + ((bottom - top) * i) / steps;
    const b = Math.min(bottom, top + ((bottom - top) * (i + 1)) / steps + 0.3);
    doc.line(x, a, x, b);
  }
}

/** A small filled diamond, centred on (cx, cy). */
function diamond(doc: Doc, cx: number, cy: number, r: number, color: RGB) {
  doc.setFillColor(...color);
  doc.triangle(cx - r, cy, cx + r, cy, cx, cy - r, 'F');
  doc.triangle(cx - r, cy, cx + r, cy, cx, cy + r, 'F');
}

/** The largest size, down to a floor, at which `text` fits in `width`. */
function fitSize(doc: Doc, text: string, width: number, max: number, min: number): number {
  const prev = doc.getFontSize();
  let size = max;
  for (; size > min; size -= 0.5) {
    doc.setFontSize(size);
    if (doc.getTextWidth(text) <= width) break;
  }
  doc.setFontSize(prev);
  return size;
}

/**
 * The mark, redrawn at four times the size it is printed. Embedded at its
 * native 900px it went in as raw pixels and made a one-page bill 1.5 MB.
 */
async function logoDataUrl(): Promise<string> {
  const img = new Image();
  img.src = '/logo.png';
  await img.decode();
  const h = 26 * 4;
  const w = Math.round((h * img.naturalWidth) / img.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/png');
}

async function fetchBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  let binary = '';
  // Chunked: a spread of a few hundred KB overflows the argument limit.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** "23 Sept 2026" — the year always, since a bill outlives the month. */
function longDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function capitalise(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'contact'
  );
}

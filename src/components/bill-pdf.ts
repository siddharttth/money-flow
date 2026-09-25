'use client';

import { formatINR } from '@/lib/money';
import { todayISO } from '@/lib/dates';

/*
 * THE BILLS.
 *
 * One person's history as a PDF, in two kinds. The lending bill is their
 * lent-and-borrowed ledger, with the net balance as the inspector states it.
 * The expense bill is every expense they were part of, with the share they
 * carried. Both put every entry in oldest first, numbered. Nothing here
 * computes money beyond adding up the rows: the balance and the lifetime
 * total arrive from the same responses the inspector draws, so the page and
 * the paper cannot disagree.
 *
 * Both are laid out the same way, like a payslip: a letterhead, the headline
 * figure written as the equation it is, a column of particulars on the left,
 * and the entries as a bracketed section that ends in its totals. Each kind
 * only supplies the words and the rows (`Statement`); `render` draws either.
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

export type ExpenseBillEntry = {
  id: string;
  shareMinor: number;
  amountMinor: number;
  participants: number;
  expenseDate: string;
  note: string | null;
  category: { name: string; color: string };
};

export type ExpenseBillInput = {
  name: string;
  relationship: string;
  /** The drawer's "Spent · lifetime" — the total the rows must reach. */
  lifetimeMinor: number;
  monthMinor: number;
  /** YYYY-MM, the month `monthMinor` belongs to. */
  month: string;
  /** Every expense, newest first, as the API lists them. */
  entries: ExpenseBillEntry[];
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
const FOOT = 60; // reserved at the bottom of every page

/** One line of the table. The amount cell is drawn by hand from these parts. */
type Row = {
  date: string;
  subject: string;
  /** A second, muted line under the subject. */
  detail?: string;
  figure: string;
  /** Small and faint, after the figure — "gave", "₹750 ÷ 3", or nothing. */
  label: string;
  mark: { kind: 'arrow'; up: boolean; color: RGB } | { kind: 'dot'; color: RGB };
};

/** Everything that differs between the two bills. */
type Statement = {
  title: string;
  net: { label: string; value: string; phrase: string; phraseColor: RGB };
  /** The right-hand side of the equation, signs included. */
  terms: { label: string; value: string; from: RGB; to: RGB }[];
  particulars: [string, string][];
  section: { title: string; note: string };
  amountHead: string;
  /** Oldest first. */
  rows: Row[];
  totals: { label: string; value: string; wash: RGB; strong?: boolean }[];
  filename: string;
};

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export async function downloadLedgerBill(input: LedgerBillInput): Promise<void> {
  const today = todayISO();
  // The inspector's list is newest-first (oldest-first reversed), so reversing
  // it again gives the order it was recorded in, same-day ties included.
  const rows = [...input.entries].reverse();
  const bal = input.balanceMinor;
  const tone: RGB = bal === 0 ? INK : bal > 0 ? GREEN : RED;
  const toneWash: RGB = bal === 0 ? SETTLED_WASH : bal > 0 ? OWED_WASH : OWE_WASH;
  const netPhrase = bal === 0 ? 'settled' : bal > 0 ? 'owed to you' : 'you owe';
  const lentCount = rows.filter((e) => e.direction === 'out').length;
  const balance = bal === 0 ? 'Settled' : `${formatINR(Math.abs(bal))} ${netPhrase}`;

  // Owing is got − gave; being owed is gave − got. The larger side goes
  // first with a +, so the equation reads the way the balance was reached.
  const gotFirst = bal <= 0;
  const terms = [
    { label: 'Got', value: `${gotFirst ? '+' : '-'} ${formatINR(input.borrowedMinor)}`, from: GOT_FROM, to: GOT_TO },
    { label: 'Gave', value: `${gotFirst ? '-' : '+'} ${formatINR(input.lentMinor)}`, from: GAVE_FROM, to: GAVE_TO },
  ];
  if (!gotFirst) terms.reverse();

  await render({
    title: `Lending statement: ${input.name}`,
    net: {
      label: 'Net balance',
      value: bal === 0 ? 'Settled' : formatINR(Math.abs(bal)),
      phrase: bal === 0 ? 'nothing open' : netPhrase,
      phraseColor: tone,
    },
    terms,
    particulars: [
      ['Contact', input.name],
      ['Relationship', capitalise(input.relationship)],
      ...period(rows.map((e) => e.entryDate)),
      ['Entries', String(rows.length)],
      ['Money you gave', `${count(lentCount, 'entry', 'entries')} · ${formatINR(input.lentMinor)}`],
      ['Money you got', `${count(rows.length - lentCount, 'entry', 'entries')} · ${formatINR(input.borrowedMinor)}`],
      ['Balance', balance],
      ['Generated on', longDate(today)],
    ],
    section: { title: 'Entries', note: 'Every amount lent and borrowed, oldest first' },
    amountHead: 'Amount',
    rows: rows.map((e) => {
      const out = e.direction === 'out';
      return {
        date: e.entryDate,
        subject: e.note?.trim() || (out ? 'Lent' : 'Borrowed'),
        figure: formatINR(e.amountMinor),
        label: out ? 'gave' : 'got',
        mark: { kind: 'arrow', up: out, color: out ? RED : GREEN },
      };
    }),
    totals: [
      { label: 'Total gave', value: `- ${formatINR(input.lentMinor)}`, wash: GAVE_WASH },
      { label: 'Total got', value: `+ ${formatINR(input.borrowedMinor)}`, wash: GOT_WASH },
      { label: 'Net balance', value: balance, wash: toneWash, strong: true },
    ],
    filename: `moneyflow-ledger-${slug(input.name)}-${today}.pdf`,
  });
}

/**
 * Every expense the person was part of, and the share they carried. The
 * headline is the drawer's lifetime figure, split into what they paid for
 * alone and their shares of bills split with others — the same shares the
 * drawer lists, so the rows add up to the headline.
 */
export async function downloadExpenseBill(input: ExpenseBillInput): Promise<void> {
  const today = todayISO();
  const rows = [...input.entries].reverse();
  const solo = rows.filter((e) => e.participants <= 1);
  const split = rows.filter((e) => e.participants > 1);
  const sum = (list: ExpenseBillEntry[]) => list.reduce((s, e) => s + e.shareMinor, 0);
  const soloMinor = sum(solo);
  const splitMinor = sum(split);
  const monthName = longMonth(input.month);

  await render({
    title: `Expense statement: ${input.name}`,
    net: {
      label: 'Total spent',
      value: formatINR(input.lifetimeMinor),
      phrase: `across ${count(rows.length, 'expense', 'expenses')}`,
      phraseColor: MUTED,
    },
    terms: [
      { label: 'Paid alone', value: `+ ${formatINR(soloMinor)}`, from: GOT_FROM, to: GOT_TO },
      { label: 'Split shares', value: `+ ${formatINR(splitMinor)}`, from: GAVE_FROM, to: GAVE_TO },
    ],
    particulars: [
      ['Contact', input.name],
      ['Relationship', capitalise(input.relationship)],
      ...period(rows.map((e) => e.expenseDate)),
      ['Expenses', String(rows.length)],
      ['Paid alone', `${count(solo.length, 'expense', 'expenses')} · ${formatINR(soloMinor)}`],
      ['Split with others', `${count(split.length, 'expense', 'expenses')} · ${formatINR(splitMinor)}`],
      [`Spent in ${monthName}`, formatINR(input.monthMinor)],
      ['Total spent', formatINR(input.lifetimeMinor)],
      ['Generated on', longDate(today)],
    ],
    section: { title: 'Expenses', note: 'Every expense and the share carried, oldest first' },
    amountHead: 'Share',
    rows: rows.map((e) => ({
      date: e.expenseDate,
      subject: e.category.name,
      detail: e.note?.trim() || undefined,
      figure: formatINR(e.shareMinor),
      label: e.participants > 1 ? `${formatINR(e.amountMinor)} ÷ ${e.participants}` : '',
      mark: { kind: 'dot', color: /^#[0-9a-f]{6}$/i.test(e.category.color) ? hex(e.category.color) : FAINT },
    })),
    totals: [
      { label: 'Paid alone', value: `+ ${formatINR(soloMinor)}`, wash: GOT_WASH },
      { label: 'Split shares', value: `+ ${formatINR(splitMinor)}`, wash: GAVE_WASH },
      { label: 'Total spent', value: formatINR(input.lifetimeMinor), wash: OWED_WASH, strong: true },
    ],
    filename: `moneyflow-expenses-${slug(input.name)}-${today}.pdf`,
  });
}

/** Period start and end, as two particulars. */
function period(dates: string[]): [string, string][] {
  const first = dates[0];
  const last = dates[dates.length - 1];
  return [
    ['Period start', first ? longDate(first) : '—'],
    ['Period end', last ? longDate(last) : '—'],
  ];
}

async function render(s: Statement): Promise<void> {
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
  const rows = s.rows;

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
  doc.setFontSize(fitSize(doc, s.title, 158, 11, 8));
  doc.text(s.title, headX + 12, 61);
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

  /* ---------- the headline, as the equation it is ---------- */
  const eqY = 128;
  font('normal', 8.5, MUTED);
  doc.text(s.net.label, MAIN_X, eqY);
  font('bold', 15, INK);
  doc.text(s.net.value, MAIN_X, eqY + 19);
  font('bold', 8, s.net.phraseColor);
  doc.text(s.net.phrase, MAIN_X, eqY + 32);

  const netW = Math.max(
    (doc.setFont('NotoSans', 'bold'), doc.setFontSize(15), doc.getTextWidth(s.net.value)),
    (doc.setFontSize(8), doc.getTextWidth(s.net.phrase)),
    (doc.setFont('NotoSans', 'normal'), doc.setFontSize(8.5), doc.getTextWidth(s.net.label)),
  );
  const eqX = MAIN_X + netW + 16;
  font('normal', 16, MUTED);
  doc.text('=', eqX, eqY + 16);

  let tx = eqX + 22;
  for (const t of s.terms) {
    gradRect(doc, tx, eqY - 9, 2.8, 34, t.from, t.to, 'v');
    font('normal', 8.5, MUTED);
    doc.text(t.label, tx + 9, eqY);
    const labelW = doc.getTextWidth(t.label);
    font('bold', 12.5, INK);
    doc.text(t.value, tx + 9, eqY + 18);
    tx += 9 + Math.max(doc.getTextWidth(t.value), labelW, 40) + 26;
  }

  /* ---------- particulars, down the left ---------- */
  let py = 196;
  for (const [label, value] of s.particulars) {
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
  doc.text(s.section.title, MAIN_X + 30, secY + 4);
  const titleW = doc.getTextWidth(s.section.title);
  diamond(doc, MAIN_X + 30 + titleW + 10, secY, 3.6, GOT_FROM);
  font('normal', 8, MUTED);
  doc.text(s.section.note, MAIN_X + 30 + titleW + 21, secY + 3.5);

  const tableX = MAIN_X + 20;
  const tableW = PAGE_W - M - tableX;
  const firstPage = doc.getNumberOfPages();

  /*
   * The amount column on a fixed grid, so every row lines up with the next:
   * a label slot as wide as the widest label at the right edge, every figure
   * ending at the same line before it, and the marks in one column set by the
   * widest figure in the statement — not each hugging its own.
   */
  const AMT = { pad: 10, labelGap: 7, markGap: 11, markW: 7 };
  font('normal', 7.5, FAINT);
  const labelSlot = Math.max(0, ...rows.map((r) => doc.getTextWidth(r.label)));
  const labelGap = labelSlot ? AMT.labelGap : 0;
  font('bold', 10, INK);
  const widestFigure = Math.max(...rows.map((r) => doc.getTextWidth(r.figure)));
  const amountColW = Math.max(112, AMT.pad * 2 + AMT.markW + AMT.markGap + widestFigure + labelGap + labelSlot);
  const SUBJECT = { size: 9.5, lead: 9.5 * 1.15 };
  const subjectLines = new Map<number, { lines: string[]; strong: number }>();

  autoTable(doc, {
    startY: secY + 22,
    margin: { left: tableX, right: M, top: 70, bottom: FOOT + 10 },
    head: [['S.No', 'Date', 'Subject', s.amountHead]],
    // The subject and the amount are drawn by hand (two tones in one cell);
    // their cell text is only there to size the row.
    body: rows.map((r, i) => [
      String(i + 1),
      longDate(r.date),
      r.detail ? `${r.subject}\n${r.detail}` : r.subject,
      '',
    ]),
    theme: 'plain',
    // A row moves whole to the next page rather than splitting: a bill line
    // cut in half reads as two, and the continued half has no entry behind it.
    rowPageBreak: 'avoid',
    styles: {
      font: 'NotoSans',
      fontSize: SUBJECT.size,
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
      3: { cellWidth: amountColW, cellPadding: { top: 8, bottom: 8, left: AMT.pad, right: AMT.pad } },
    },
    didParseCell: (d) => {
      // Drawn by hand in didDrawCell; the header centres on what sits under
      // it, not on the cell, whose spare width is all on the left.
      if (d.section === 'head' && d.column.index === 3) d.cell.text = [''];
    },
    willDrawCell: (d) => {
      // The header's wash runs mint into white across the whole row, and every
      // other entry row carries a fainter version of it. Painted once per
      // row, from its first cell, so no cell edge can show.
      const band = d.section === 'body' && d.row.index % 2 === 1;
      if ((d.section === 'head' || band) && d.column.index === 0) {
        const rowW = Object.values(d.row.cells).reduce((w, c) => w + c.width, 0);
        gradRect(doc, d.cell.x, d.cell.y, rowW, d.cell.height, band ? BAND : MINT, mix(band ? BAND : MINT, WHITE, 0.9), 'h');
      }
      // The subject, wrapped as the table sized it, taken off the cell to be
      // drawn in two tones: the subject in ink, the detail muted beneath.
      if (d.section === 'body' && d.column.index === 2) {
        const r = rows[d.row.index];
        if (!r) return;
        font('normal', SUBJECT.size, INK);
        const strong = (doc.splitTextToSize(r.subject, d.cell.width - 14) as string[]).length;
        subjectLines.set(d.row.index, { lines: [...d.cell.text], strong });
        d.cell.text = [];
      }
    },
    didDrawCell: (d) => {
      if (d.section === 'body' && d.column.index === 2) {
        const t = subjectLines.get(d.row.index);
        if (!t) return;
        const top = d.cell.y + d.cell.height / 2 - (t.lines.length * SUBJECT.lead) / 2;
        t.lines.forEach((line, i) => {
          font('normal', i < t.strong ? SUBJECT.size : 8.5, i < t.strong ? INK : MUTED);
          doc.text(line, d.cell.x + 7, top + SUBJECT.lead * (i + 0.5), { baseline: 'middle' });
        });
        return;
      }
      if (d.column.index !== 3) return;
      const mid = d.cell.y + d.cell.height / 2;
      const labelX = d.cell.x + d.cell.width - AMT.pad - labelSlot; // label slot, left-aligned
      const figureRight = labelX - labelGap; // every figure ends here
      const markX = figureRight - widestFigure - AMT.markGap; // one column of marks
      if (d.section === 'head') {
        // Centred over mark, figure and label together.
        font('bold', 8.5, INK);
        doc.text(s.amountHead, (markX - AMT.markW / 2 + labelX + labelSlot) / 2, mid + 3, { align: 'center' });
        return;
      }
      if (d.section !== 'body') return;
      const r = rows[d.row.index];
      if (!r) return;
      if (r.label) {
        font('normal', 7.5, FAINT);
        doc.text(r.label, labelX, mid + 3);
      }
      font('bold', 10, INK);
      doc.text(r.figure, figureRight, mid + 3.5, { align: 'right' });
      if (r.mark.kind === 'arrow') drawArrow(doc, markX, mid, r.mark.up, r.mark.color);
      else {
        doc.setFillColor(...r.mark.color);
        doc.circle(markX, mid, 2.8, 'F');
      }
    },
  });

  /* ---------- totals, as the reference closes a section ---------- */
  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  if (y + s.totals.length * 26 + 10 > PAGE_H - FOOT - 10) {
    doc.addPage();
    y = 70;
  }
  const totalsX = tableX + tableW * 0.38;
  for (const t of s.totals) {
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

  doc.save(s.filename);
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

/** "September 2026". */
function longMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
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

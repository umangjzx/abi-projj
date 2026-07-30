import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import type { ReportColumn, ReportPayload } from './report.service';

const BRAND = '#0D9488';
const INK = '#0F172A';
const MUTED = '#6B7280';

// ------------------------------------------------------------------------ CSV ---

/**
 * RFC 4180 CSV. Values are quoted whenever they contain a delimiter, quote or
 * newline, and a leading `=+-@` is prefixed with a tab so spreadsheet software
 * cannot interpret a data value as a formula (CSV injection).
 */
export function toCsv(report: ReportPayload): string {
  const escape = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    let text = value instanceof Date ? value.toISOString() : String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `\t${text}`;
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const lines: string[] = [];
  lines.push(escape(report.title));
  lines.push(escape(report.subtitle));
  lines.push(escape(`Generated: ${report.generatedAt.toISOString()}`));
  lines.push('');
  for (const item of report.summary) lines.push(`${escape(item.label)},${escape(item.value)}`);
  lines.push('');
  lines.push(report.columns.map((c) => escape(c.label)).join(','));
  for (const row of report.rows) {
    lines.push(report.columns.map((c) => escape(formatCell(row[c.key], c))).join(','));
  }

  // BOM so Excel opens UTF-8 (₹, accented names) correctly on Windows.
  return `﻿${lines.join('\r\n')}`;
}

// ---------------------------------------------------------------------- Excel ---

export async function toExcel(report: ReportPayload): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Thuthi Dairy Private Limited';
  workbook.created = report.generatedAt;

  const sheet = workbook.addWorksheet(report.title.slice(0, 30), {
    views: [{ state: 'frozen', ySplit: 0 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  });

  // -- title block --
  sheet.mergeCells(1, 1, 1, Math.max(2, report.columns.length));
  const titleCell = sheet.getCell('A1');
  titleCell.value = `Thuthi Dairy — ${report.title}`;
  titleCell.font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(1).height = 30;

  sheet.mergeCells(2, 1, 2, Math.max(2, report.columns.length));
  const subtitleCell = sheet.getCell('A2');
  subtitleCell.value = `${report.subtitle}   •   Generated ${report.generatedAt.toLocaleString('en-IN')}`;
  subtitleCell.font = { size: 9, italic: true, color: { argb: 'FF6B7280' } };

  let cursor = 4;

  // -- summary block --
  sheet.getCell(cursor, 1).value = 'SUMMARY';
  sheet.getCell(cursor, 1).font = { bold: true, size: 10, color: { argb: 'FF0D9488' } };
  cursor += 1;

  for (const item of report.summary) {
    sheet.getCell(cursor, 1).value = item.label;
    sheet.getCell(cursor, 1).font = { color: { argb: 'FF6B7280' }, size: 10 };
    sheet.getCell(cursor, 2).value = item.value;
    sheet.getCell(cursor, 2).font = { bold: true, size: 10 };
    cursor += 1;
  }

  cursor += 1;

  // -- header row --
  const headerRowIndex = cursor;
  const headerRow = sheet.getRow(headerRowIndex);
  report.columns.forEach((column, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = column.label;
    cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
    cell.alignment = { vertical: 'middle', horizontal: isNumeric(column) ? 'right' : 'left' };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
    sheet.getColumn(index + 1).width = column.width ?? 16;
  });
  headerRow.height = 22;
  cursor += 1;

  // -- data rows --
  for (const row of report.rows) {
    const excelRow = sheet.getRow(cursor);
    report.columns.forEach((column, index) => {
      const cell = excelRow.getCell(index + 1);
      const raw = row[column.key];

      if (raw === null || raw === undefined || raw === '') {
        cell.value = '-';
      } else if (column.type === 'currency' || column.type === 'number' || column.type === 'percent') {
        cell.value = Number(raw);
        cell.numFmt = column.type === 'currency' ? '₹#,##0.00' : column.type === 'percent' ? '0.00"%"' : '#,##0';
      } else if (column.type === 'date') {
        cell.value = raw instanceof Date ? raw : new Date(String(raw));
        cell.numFmt = 'dd-mmm-yyyy';
      } else {
        cell.value = String(raw);
      }

      cell.alignment = { vertical: 'middle', horizontal: isNumeric(column) ? 'right' : 'left' };
      cell.font = { size: 10 };
    });

    // Banded rows for readability on long exports.
    if ((cursor - headerRowIndex) % 2 === 0) {
      excelRow.eachCell({ includeEmpty: false }, (cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      });
    }
    cursor += 1;
  }

  // Excel's AutoFilter needs the exact header + data extent.
  if (report.rows.length) {
    sheet.autoFilter = {
      from: { row: headerRowIndex, column: 1 },
      to: { row: cursor - 1, column: report.columns.length },
    };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// ------------------------------------------------------------------------ PDF ---

export function toPdf(report: ReportPayload): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // Landscape gives wide tables (13 columns on the sales report) room to breathe.
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36, info: { Title: report.title } });
    const chunks: Buffer[] = [];

    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - 72;
    const totalWeight = report.columns.reduce((sum, c) => sum + (c.width ?? 16), 0);
    const widths = report.columns.map((c) => ((c.width ?? 16) / totalWeight) * pageWidth);

    const drawHeader = () => {
      doc.rect(0, 0, doc.page.width, 62).fill(BRAND);
      doc.fillColor('#ffffff').fontSize(15).font('Helvetica-Bold').text('Thuthi Dairy Private Limited', 36, 16);
      doc.fontSize(11).font('Helvetica').text(report.title, 36, 36);
      doc
        .fontSize(8)
        .text(`Generated ${report.generatedAt.toLocaleString('en-IN')}`, 36, 22, { width: pageWidth, align: 'right' });
      doc.fillColor(INK);
    };

    const drawTableHead = (y: number): number => {
      doc.rect(36, y, pageWidth, 20).fill('#334155');
      doc.fillColor('#ffffff').fontSize(7.5).font('Helvetica-Bold');
      let x = 36;
      report.columns.forEach((column, index) => {
        doc.text(column.label.toUpperCase(), x + 4, y + 6.5, {
          width: widths[index] - 8,
          align: isNumeric(column) ? 'right' : 'left',
          ellipsis: true,
        });
        x += widths[index];
      });
      doc.fillColor(INK).font('Helvetica');
      return y + 20;
    };

    drawHeader();
    let y = 78;

    // -- summary chips --
    doc.fontSize(8).font('Helvetica-Bold').fillColor(MUTED).text(report.subtitle, 36, y, { width: pageWidth });
    y += 16;

    const chipWidth = pageWidth / Math.min(4, Math.max(1, report.summary.length));
    report.summary.forEach((item, index) => {
      const col = index % 4;
      const rowIndex = Math.floor(index / 4);
      const chipX = 36 + col * chipWidth;
      const chipY = y + rowIndex * 32;

      doc.roundedRect(chipX, chipY, chipWidth - 6, 28, 4).fill('#F1F5F9');
      doc.fillColor(MUTED).fontSize(6.5).font('Helvetica').text(item.label.toUpperCase(), chipX + 7, chipY + 5, { width: chipWidth - 20, ellipsis: true });
      doc.fillColor(INK).fontSize(9.5).font('Helvetica-Bold').text(item.value, chipX + 7, chipY + 15, { width: chipWidth - 20, ellipsis: true });
    });

    y += Math.ceil(report.summary.length / 4) * 32 + 10;
    y = drawTableHead(y);

    doc.fontSize(7.5).font('Helvetica');

    if (!report.rows.length) {
      doc.fillColor(MUTED).fontSize(10).text('No data available for the selected period.', 36, y + 16, {
        width: pageWidth,
        align: 'center',
      });
    }

    report.rows.forEach((row, rowIndex) => {
      // Repeat the table head after a page break so long exports stay readable.
      if (y > doc.page.height - 64) {
        doc.addPage();
        drawHeader();
        y = drawTableHead(74);
        doc.fontSize(7.5).font('Helvetica');
      }

      if (rowIndex % 2 === 1) doc.rect(36, y, pageWidth, 15).fill('#F8FAFC');

      doc.fillColor(INK);
      let x = 36;
      report.columns.forEach((column, index) => {
        doc.text(formatCell(row[column.key], column), x + 4, y + 4.5, {
          width: widths[index] - 8,
          align: isNumeric(column) ? 'right' : 'left',
          ellipsis: true,
          lineBreak: false,
        });
        x += widths[index];
      });

      y += 15;
    });

    // -- footer with page numbers --
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(pages.start + i);
      doc
        .fontSize(7)
        .fillColor(MUTED)
        .font('Helvetica')
        .text(
          `Thuthi Dairy Private Limited — confidential business report   •   Page ${i + 1} of ${pages.count}`,
          36,
          doc.page.height - 26,
          { width: pageWidth, align: 'center' },
        );
    }

    doc.end();
  });
}

// -------------------------------------------------------------------- helpers ---

const isNumeric = (column: ReportColumn) =>
  column.type === 'number' || column.type === 'currency' || column.type === 'percent';

function formatCell(value: unknown, column: ReportColumn): string {
  if (value === null || value === undefined || value === '') return '-';

  switch (column.type) {
    case 'currency':
      return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value));
    case 'percent':
      return `${Number(value).toFixed(2)}%`;
    case 'number':
      return new Intl.NumberFormat('en-IN').format(Number(value));
    case 'date': {
      const date = value instanceof Date ? value : new Date(String(value));
      return Number.isNaN(date.getTime())
        ? '-'
        : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    }
    default:
      return String(value);
  }
}

import PDFDocument from 'pdfkit';
import { formatINR } from '../../lib/money';
import { pricingConfig } from '../cart/pricing';

const BRAND = '#0d9488';
const INK = '#0f172a';
const MUTED = '#6b7280';
const LINE = '#e5e7eb';

/**
 * GST-style tax invoice generated with PDFKit (no headless browser needed, so
 * it works on any Render/Railway instance). Returns the finished PDF as a
 * Buffer for the route to stream.
 */
export const invoiceService = {
  build(order: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 44, info: { Title: `Invoice ${order.orderNumber}` } });
      const chunks: Buffer[] = [];

      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageWidth = doc.page.width - 88;
      const right = doc.page.width - 44;

      // ------------------------------------------------------------- header ---
      doc.rect(0, 0, doc.page.width, 96).fill(BRAND);
      doc.fillColor('#ffffff').fontSize(21).font('Helvetica-Bold').text('Thuthi Dairy Private Limited', 44, 30);
      doc.fontSize(9).font('Helvetica').text('Farm fresh dairy, delivered daily  |  GSTIN: 33AABCT1234K1ZV', 44, 58);
      doc.fontSize(15).font('Helvetica-Bold').text('TAX INVOICE', 44, 72, { width: pageWidth, align: 'right' });

      doc.fillColor(INK);
      let y = 122;

      // ---------------------------------------------------- order meta block ---
      const ship = order.shipTo ?? {};
      doc.fontSize(9).font('Helvetica-Bold').fillColor(MUTED).text('BILLED TO', 44, y);
      doc.fontSize(11).font('Helvetica-Bold').fillColor(INK).text(ship.fullName ?? order.customer?.name ?? '-', 44, y + 14);
      doc
        .fontSize(9)
        .font('Helvetica')
        .fillColor(MUTED)
        .text(
          [ship.line1, ship.line2, ship.landmark, `${ship.city ?? ''} ${ship.state ?? ''} ${ship.pincode ?? ''}`.trim(), ship.country, ship.phone]
            .filter(Boolean)
            .join('\n'),
          44,
          y + 30,
          { width: 240 },
        );

      const metaX = 330;
      const meta: [string, string][] = [
        ['Invoice no.', order.orderNumber],
        ['Order date', new Date(order.placedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })],
        ['Status', String(order.status).replace(/_/g, ' ')],
        ['Payment', `${order.payment?.method ?? '-'} (${order.payment?.status ?? '-'})`],
      ];
      meta.forEach(([label, value], i) => {
        const rowY = y + 14 + i * 16;
        doc.fontSize(9).font('Helvetica').fillColor(MUTED).text(label, metaX, rowY, { width: 90 });
        doc.font('Helvetica-Bold').fillColor(INK).text(value, metaX + 92, rowY, { width: right - metaX - 92, align: 'right' });
      });

      y += 110;

      // --------------------------------------------------------- items table ---
      const cols = { item: 44, qty: 330, price: 390, total: 470 };

      doc.rect(44, y, pageWidth, 24).fill('#f3f4f6');
      doc.fillColor(MUTED).fontSize(9).font('Helvetica-Bold');
      doc.text('ITEM', cols.item + 8, y + 8);
      doc.text('QTY', cols.qty, y + 8, { width: 40, align: 'right' });
      doc.text('RATE', cols.price, y + 8, { width: 60, align: 'right' });
      doc.text('AMOUNT', cols.total, y + 8, { width: right - cols.total - 8, align: 'right' });
      y += 24;

      doc.font('Helvetica').fillColor(INK).fontSize(9.5);
      for (const item of order.items) {
        // Start a new page before the row would overflow the footer area.
        if (y > doc.page.height - 190) {
          doc.addPage();
          y = 60;
        }

        const name = `${item.productName} — ${item.variantName}`;
        const nameHeight = doc.heightOfString(name, { width: cols.qty - cols.item - 16 });
        const rowHeight = Math.max(22, nameHeight + 14);

        doc.fillColor(INK).font('Helvetica').text(name, cols.item + 8, y + 6, { width: cols.qty - cols.item - 16 });
        doc.fillColor(MUTED).fontSize(7.5).text(item.sku, cols.item + 8, y + 6 + nameHeight, { width: 200 });
        doc.fontSize(9.5).fillColor(INK);
        doc.text(String(item.quantity), cols.qty, y + 6, { width: 40, align: 'right' });
        doc.text(formatINR(item.unitPrice), cols.price, y + 6, { width: 60, align: 'right' });
        doc.font('Helvetica-Bold').text(formatINR(item.lineTotal), cols.total, y + 6, { width: right - cols.total - 8, align: 'right' });

        y += rowHeight;
        doc.moveTo(44, y).lineTo(right, y).lineWidth(0.5).strokeColor(LINE).stroke();
      }

      // ------------------------------------------------------------- totals ---
      y += 14;
      if (y > doc.page.height - 170) {
        doc.addPage();
        y = 60;
      }

      const totalsX = 330;
      const rows: [string, string, boolean?][] = [
        ['Subtotal', formatINR(order.subtotal)],
        ...(order.discount > 0
          ? ([[`Discount${order.coupon ? ` (${order.coupon.code})` : ''}`, `- ${formatINR(order.discount)}`]] as [string, string][])
          : []),
        ['Delivery fee', order.deliveryFee === 0 ? 'FREE' : formatINR(order.deliveryFee)],
        [`GST (${pricingConfig.taxPercent}%)`, formatINR(order.tax)],
      ];

      rows.forEach(([label, value]) => {
        doc.fontSize(9.5).font('Helvetica').fillColor(MUTED).text(label, totalsX, y, { width: 130 });
        doc.font('Helvetica-Bold').fillColor(INK).text(value, totalsX + 132, y, { width: right - totalsX - 132, align: 'right' });
        y += 17;
      });

      doc.rect(totalsX, y + 2, right - totalsX, 30).fill(BRAND);
      doc.fillColor('#ffffff').fontSize(11).font('Helvetica-Bold').text('TOTAL PAID', totalsX + 10, y + 12);
      doc.fontSize(13).text(formatINR(order.total), totalsX + 10, y + 10, { width: right - totalsX - 20, align: 'right' });

      y += 48;

      // ------------------------------------------------------------- footer ---
      doc.fillColor(MUTED).fontSize(8).font('Helvetica');
      doc.text(
        'This is a computer-generated invoice and does not require a physical signature. ' +
          'Perishable dairy goods are non-returnable once the cold chain is broken; report quality issues within 24 hours of delivery.',
        44,
        y,
        { width: pageWidth },
      );
      doc.text(
        `Thuthi Dairy Private Limited  •  support@thuthidairy.com  •  Generated ${new Date().toLocaleString('en-IN')}`,
        44,
        doc.page.height - 60,
        { width: pageWidth, align: 'center' },
      );

      doc.end();
    });
  },
};

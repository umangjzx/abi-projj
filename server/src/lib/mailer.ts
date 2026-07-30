import fs from 'node:fs';
import path from 'node:path';
import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env';
import { logger } from './logger';

/**
 * Email delivery with a graceful development fallback: when SMTP_HOST is unset
 * the message is logged and appended to `storage/mail-outbox.log` instead of
 * being sent, so the whole verification/OTP flow is testable with zero setup.
 */
let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!env.mailEnabled) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

export interface MailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendMail({ to, subject, html, text }: MailOptions): Promise<void> {
  const tx = getTransporter();

  if (!tx) {
    const outbox = path.resolve(process.cwd(), 'storage');
    fs.mkdirSync(outbox, { recursive: true });
    fs.appendFileSync(
      path.join(outbox, 'mail-outbox.log'),
      `\n===== ${new Date().toISOString()} =====\nTO: ${to}\nSUBJECT: ${subject}\n\n${text ?? stripHtml(html)}\n`,
      'utf8',
    );
    logger.info({ to, subject }, 'email captured to storage/mail-outbox.log (SMTP not configured)');
    return;
  }

  try {
    await tx.sendMail({ from: env.MAIL_FROM, to, subject, html, text: text ?? stripHtml(html) });
    logger.info({ to, subject }, 'email sent');
  } catch (err) {
    // Never let a mail failure break the business transaction that triggered it.
    logger.error({ err, to, subject }, 'email delivery failed');
  }
}

const stripHtml = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

// --------------------------------------------------------------- templates ---

const shell = (heading: string, body: string) => `
<div style="font-family:Inter,Segoe UI,Arial,sans-serif;background:#f6f7f9;padding:32px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e6e8ec">
    <div style="background:linear-gradient(135deg,#0f766e,#0d9488);padding:24px 28px;color:#fff">
      <div style="font-size:20px;font-weight:700;letter-spacing:-0.02em">Thuthi Dairy</div>
      <div style="font-size:13px;opacity:.85">Farm fresh, every single day</div>
    </div>
    <div style="padding:28px">
      <h2 style="margin:0 0 12px;font-size:19px;color:#0f172a">${heading}</h2>
      <div style="font-size:14px;line-height:1.65;color:#3f4652">${body}</div>
    </div>
    <div style="padding:16px 28px;background:#fafbfc;border-top:1px solid #eef0f3;font-size:11px;color:#8a929e">
      Thuthi Dairy Private Limited &middot; This is an automated message, please do not reply.
    </div>
  </div>
</div>`;

const otpBlock = (code: string) => `
  <div style="margin:20px 0;padding:16px;background:#f0fdfa;border:1px dashed #0d9488;border-radius:12px;text-align:center">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:#0f766e">Your code</div>
    <div style="font-size:32px;font-weight:700;letter-spacing:.24em;color:#0f766e;margin-top:6px">${code}</div>
  </div>
  <p style="font-size:13px;color:#6b7280">This code expires in ${env.OTP_TTL_MINUTES} minutes. If you did not request it, you can safely ignore this email.</p>`;

export const mailTemplates = {
  verifyEmail: (name: string, code: string) => ({
    subject: 'Verify your Thuthi Dairy account',
    html: shell(
      `Welcome, ${name}!`,
      `<p>Thanks for creating an account. Enter the code below to verify your email address and start shopping.</p>${otpBlock(code)}`,
    ),
  }),

  passwordReset: (name: string, code: string) => ({
    subject: 'Reset your Thuthi Dairy password',
    html: shell(
      `Password reset requested`,
      `<p>Hi ${name}, use the code below to set a new password.</p>${otpBlock(code)}`,
    ),
  }),

  passwordChanged: (name: string) => ({
    subject: 'Your password was changed',
    html: shell(
      'Password updated',
      `<p>Hi ${name}, your Thuthi Dairy password was changed successfully. If this wasn't you, please reset your password immediately and contact support.</p>`,
    ),
  }),

  orderPlaced: (name: string, orderNumber: string, total: string, itemCount: number) => ({
    subject: `Order ${orderNumber} confirmed`,
    html: shell(
      'Thank you for your order!',
      `<p>Hi ${name}, we've received your order and it is being prepared.</p>
       <table style="width:100%;margin:16px 0;font-size:14px;border-collapse:collapse">
         <tr><td style="padding:6px 0;color:#6b7280">Order number</td><td style="text-align:right;font-weight:600">${orderNumber}</td></tr>
         <tr><td style="padding:6px 0;color:#6b7280">Items</td><td style="text-align:right;font-weight:600">${itemCount}</td></tr>
         <tr><td style="padding:6px 0;color:#6b7280">Total</td><td style="text-align:right;font-weight:600">${total}</td></tr>
       </table>
       <p><a href="${env.CLIENT_URL}/account/orders" style="display:inline-block;background:#0d9488;color:#fff;text-decoration:none;padding:11px 20px;border-radius:9px;font-weight:600;font-size:14px">Track your order</a></p>`,
    ),
  }),

  orderStatus: (name: string, orderNumber: string, status: string) => ({
    subject: `Order ${orderNumber} is now ${status.toLowerCase().replace(/_/g, ' ')}`,
    html: shell(
      'Order update',
      `<p>Hi ${name}, your order <strong>${orderNumber}</strong> is now <strong>${status.replace(/_/g, ' ').toLowerCase()}</strong>.</p>
       <p><a href="${env.CLIENT_URL}/account/orders" style="display:inline-block;background:#0d9488;color:#fff;text-decoration:none;padding:11px 20px;border-radius:9px;font-weight:600;font-size:14px">View order</a></p>`,
    ),
  }),

  lowStock: (items: { name: string; stock: number }[]) => ({
    subject: `Low stock alert: ${items.length} item(s) need restocking`,
    html: shell(
      'Inventory needs attention',
      `<p>The following variants have dropped to or below their low-stock threshold:</p>
       <ul style="padding-left:18px">${items.map((i) => `<li><strong>${i.name}</strong> &mdash; ${i.stock} left</li>`).join('')}</ul>
       <p><a href="${env.CLIENT_URL}/admin/inventory" style="display:inline-block;background:#0d9488;color:#fff;text-decoration:none;padding:11px 20px;border-radius:9px;font-weight:600;font-size:14px">Open inventory</a></p>`,
    ),
  }),
};

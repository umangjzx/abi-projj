import Razorpay from 'razorpay';
import { env } from '../config/env';

/**
 * Lazily constructed so importing this module never fails when Razorpay
 * isn't configured (local dev) -- callers must check `env.razorpayEnabled`
 * before using it.
 */
let client: Razorpay | null = null;

export function razorpay(): Razorpay {
  if (!env.razorpayEnabled) {
    throw new Error('Razorpay is not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET missing)');
  }
  if (!client) {
    client = new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET });
  }
  return client;
}

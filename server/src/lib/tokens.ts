import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { ApiError } from './ApiError';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: 'CUSTOMER' | 'ADMIN';
  permissions: string[];
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
    issuer: 'thuthi-dairy',
  } as SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: 'thuthi-dairy' }) as AccessTokenPayload;
  } catch (err) {
    const expired = err instanceof jwt.TokenExpiredError;
    throw new ApiError(401, expired ? 'Session expired, please sign in again' : 'Invalid access token', expired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN');
  }
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
    issuer: 'thuthi-dairy',
  } as SignOptions);
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    return jwt.verify(token, env.JWT_REFRESH_SECRET, { issuer: 'thuthi-dairy' }) as RefreshTokenPayload;
  } catch {
    throw new ApiError(401, 'Invalid or expired refresh token', 'INVALID_REFRESH_TOKEN');
  }
}

export const hashPassword = (plain: string) => bcrypt.hash(plain, env.BCRYPT_ROUNDS);
export const comparePassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

/**
 * Refresh tokens are stored as a SHA-256 digest. A leaked database dump
 * therefore cannot be replayed against the API, and the lookup stays a single
 * indexed equality check (bcrypt would force a full table scan).
 */
export const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

/** Cryptographically strong 6-digit numeric OTP. */
export function generateOtp(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');

/** Length-independent comparison to avoid leaking information through timing. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Converts `15m` / `30d` / `12h` style durations into milliseconds. */
export function durationToMs(duration: string): number {
  const match = /^(\d+)\s*([smhdw])$/.exec(duration.trim());
  if (!match) return Number(duration) || 0;
  const value = Number(match[1]);
  const unit = match[2] as 's' | 'm' | 'h' | 'd' | 'w';
  const factor = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 }[unit];
  return value * factor;
}

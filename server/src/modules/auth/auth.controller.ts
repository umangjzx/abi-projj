import type { Request, Response } from 'express';
import { OtpPurpose } from '@prisma/client';
import { authService } from './auth.service';
import { created, ok } from '../../lib/http';
import { env } from '../../config/env';
import { durationToMs } from '../../lib/tokens';
import { ApiError } from '../../lib/ApiError';
import { recordActivity } from '../../middleware/audit';

const REFRESH_COOKIE = 'refreshToken';

/**
 * The refresh token lives in an httpOnly cookie so XSS cannot read it, while
 * the short-lived access token is returned in the body for the SPA to hold in
 * memory. `sameSite=none` is required in production because the SPA (Vercel)
 * and API (Render) are on different domains.
 */
function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: env.isProd ? 'none' : 'lax',
    maxAge: durationToMs(env.JWT_REFRESH_EXPIRES_IN),
    path: '/',
  });
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: env.isProd ? 'none' : 'lax',
    path: '/',
  });
}

const device = (req: Request) => ({ ip: req.ip, userAgent: req.get('user-agent') ?? undefined });

export const authController = {
  async register(req: Request, res: Response) {
    const result = await authService.register(req.body, device(req));
    if (result.refreshToken) setRefreshCookie(res, result.refreshToken);
    await recordActivity({ userId: result.user.id, actorEmail: result.user.email, action: 'auth.register', entity: 'User', entityId: result.user.id });

    return created(res, {
      user: result.user,
      accessToken: result.accessToken ?? null,
      requiresVerification: result.requiresVerification,
      message: result.requiresVerification
        ? 'Account created. Check your email for the 6-digit verification code.'
        : 'Account created successfully.',
    });
  },

  async login(req: Request, res: Response) {
    const result = await authService.login(req.body, device(req));
    setRefreshCookie(res, result.refreshToken);
    return ok(res, { user: result.user, accessToken: result.accessToken });
  },

  async verifyEmail(req: Request, res: Response) {
    const result = await authService.verifyEmail(req.body.email, req.body.otp, device(req));
    setRefreshCookie(res, result.refreshToken);
    return ok(res, { user: result.user, accessToken: result.accessToken, message: 'Email verified successfully.' });
  },

  async resendOtp(req: Request, res: Response) {
    await authService.resendOtp(req.body.email, req.body.purpose as OtpPurpose);
    return ok(res, { message: 'If that email is registered, a new code has been sent.' });
  },

  async forgotPassword(req: Request, res: Response) {
    await authService.forgotPassword(req.body.email);
    return ok(res, { message: 'If that email is registered, a reset code has been sent.' });
  },

  async resetPassword(req: Request, res: Response) {
    await authService.resetPassword(req.body.email, req.body.otp, req.body.newPassword);
    clearRefreshCookie(res);
    return ok(res, { message: 'Password reset successfully. Please sign in with your new password.' });
  },

  async changePassword(req: Request, res: Response) {
    await authService.changePassword(req.user!.sub, req.body.currentPassword, req.body.newPassword);
    clearRefreshCookie(res);
    return ok(res, { message: 'Password changed. Please sign in again.' });
  },

  async refresh(req: Request, res: Response) {
    // Accept the cookie first; the body fallback keeps non-browser clients
    // (Postman, mobile) working.
    const token = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE] ?? req.body?.refreshToken;
    if (!token) throw ApiError.unauthorized('No refresh token provided');

    const result = await authService.refresh(token, device(req));
    setRefreshCookie(res, result.refreshToken);
    return ok(res, { user: result.user, accessToken: result.accessToken });
  },

  async logout(req: Request, res: Response) {
    const token = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    await authService.logout(token);
    clearRefreshCookie(res);
    return ok(res, { message: 'Signed out successfully.' });
  },

  async me(req: Request, res: Response) {
    return ok(res, await authService.me(req.user!.sub));
  },

  async updateProfile(req: Request, res: Response) {
    return ok(res, await authService.updateProfile(req.user!.sub, req.body));
  },
};

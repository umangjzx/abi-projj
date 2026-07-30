import { Router } from 'express';
import { authController } from './auth.controller';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../lib/http';
import { requireAuth } from '../../middleware/auth';
import { authLimiter, verifyCsrf } from '../../middleware/security';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resendOtpSchema,
  resetPasswordSchema,
  updateProfileSchema,
  verifyEmailSchema,
} from './auth.schema';

export const authRouter = Router();

// Credential endpoints are rate limited per IP + email.
authRouter.post('/register', authLimiter, validate({ body: registerSchema }), asyncHandler(authController.register));
authRouter.post('/login', authLimiter, validate({ body: loginSchema }), asyncHandler(authController.login));
authRouter.post('/verify-email', authLimiter, validate({ body: verifyEmailSchema }), asyncHandler(authController.verifyEmail));
authRouter.post('/resend-otp', authLimiter, validate({ body: resendOtpSchema }), asyncHandler(authController.resendOtp));
authRouter.post('/forgot-password', authLimiter, validate({ body: forgotPasswordSchema }), asyncHandler(authController.forgotPassword));
authRouter.post('/reset-password', authLimiter, validate({ body: resetPasswordSchema }), asyncHandler(authController.resetPassword));

// Cookie-driven session routes carry the CSRF double-submit check.
authRouter.post('/refresh', verifyCsrf, asyncHandler(authController.refresh));
authRouter.post('/logout', verifyCsrf, asyncHandler(authController.logout));

authRouter.get('/me', requireAuth, asyncHandler(authController.me));
authRouter.patch('/me', requireAuth, validate({ body: updateProfileSchema }), asyncHandler(authController.updateProfile));
authRouter.post(
  '/change-password',
  requireAuth,
  authLimiter,
  validate({ body: changePasswordSchema }),
  asyncHandler(authController.changePassword),
);

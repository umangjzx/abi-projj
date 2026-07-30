import { z } from 'zod';
import { emailSchema, passwordSchema, phoneSchema, otpSchema, safeText } from '../../middleware/validate';

export const registerSchema = z.object({
  name: safeText(80, 2),
  email: emailSchema,
  password: passwordSchema,
  phone: phoneSchema.optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

export const verifyEmailSchema = z.object({
  email: emailSchema,
  otp: otpSchema,
});

export const resendOtpSchema = z.object({
  email: emailSchema,
  purpose: z.enum(['EMAIL_VERIFICATION', 'PASSWORD_RESET']),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  email: emailSchema,
  otp: otpSchema,
  newPassword: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

export const updateProfileSchema = z.object({
  name: safeText(80, 2).optional(),
  phone: phoneSchema.optional().or(z.literal('')),
  avatarUrl: z.string().url().optional().or(z.literal('')),
});

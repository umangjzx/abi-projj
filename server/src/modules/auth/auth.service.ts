import { OtpPurpose, type RoleName } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../lib/ApiError';
import { env } from '../../config/env';
import {
  comparePassword,
  durationToMs,
  generateOtp,
  hashPassword,
  sha256,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../lib/tokens';
import { sendMail, mailTemplates } from '../../lib/mailer';
import { logger } from '../../lib/logger';

const PUBLIC_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  avatarUrl: true,
  emailVerified: true,
  totalOrders: true,
  totalSpent: true,
  segment: true,
  createdAt: true,
  role: { select: { name: true, label: true, permissions: true } },
} as const;

export type PublicUser = Awaited<ReturnType<typeof findPublicUserById>>;

async function findPublicUserById(id: string) {
  return prisma.user.findUniqueOrThrow({ where: { id }, select: PUBLIC_USER_SELECT });
}

async function ensureRole(name: RoleName) {
  const role = await prisma.role.findUnique({ where: { name } });
  if (!role) throw ApiError.internal(`Role ${name} is not seeded -- run the database seed`);
  return role;
}

async function issueOtp(userId: string, purpose: OtpPurpose): Promise<string> {
  const code = generateOtp();
  const expiresAt = new Date(Date.now() + env.OTP_TTL_MINUTES * 60_000);
  // Invalidate any earlier unconsumed code for the same purpose so only the
  // most recent OTP can ever succeed.
  await prisma.otpToken.updateMany({
    where: { userId, purpose, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  await prisma.otpToken.create({ data: { userId, purpose, codeHash: sha256(code), expiresAt } });
  return code;
}

async function consumeOtp(userId: string, purpose: OtpPurpose, submitted: string) {
  const token = await prisma.otpToken.findFirst({
    where: { userId, purpose, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  if (!token) throw ApiError.badRequest('No active code found -- request a new one');
  if (token.expiresAt < new Date()) throw ApiError.badRequest('This code has expired -- request a new one');
  if (token.attempts >= env.OTP_MAX_ATTEMPTS) {
    throw ApiError.tooMany('Too many incorrect attempts -- request a new code');
  }

  if (token.codeHash !== sha256(submitted)) {
    await prisma.otpToken.update({ where: { id: token.id }, data: { attempts: { increment: 1 } } });
    throw ApiError.badRequest('Incorrect code');
  }

  await prisma.otpToken.update({ where: { id: token.id }, data: { consumedAt: new Date() } });
}

interface DeviceInfo {
  ip?: string;
  userAgent?: string;
}

async function issueSession(user: { id: string; email: string; role: { name: RoleName; permissions: string[] } }, device: DeviceInfo) {
  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role.name,
    permissions: user.role.permissions,
  });

  const jti = sha256(`${user.id}:${Date.now()}:${Math.random()}`);
  const refreshToken = signRefreshToken({ sub: user.id, jti });

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: sha256(refreshToken),
      ip: device.ip,
      userAgent: device.userAgent?.slice(0, 255),
      expiresAt: new Date(Date.now() + durationToMs(env.JWT_REFRESH_EXPIRES_IN)),
    },
  });

  return { accessToken, refreshToken };
}

export const authService = {
  async register(input: { name: string; email: string; password: string; phone?: string }, device: DeviceInfo) {
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw ApiError.conflict('An account with this email already exists');

    const role = await ensureRole('CUSTOMER');
    const passwordHash = await hashPassword(input.password);

    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone,
        passwordHash,
        roleId: role.id,
        emailVerified: !env.REQUIRE_EMAIL_VERIFICATION,
      },
      include: { role: { select: { name: true, permissions: true } } },
    });

    // Give every new customer an empty cart up front so cart routes never
    // have to special-case "cart does not exist yet".
    await prisma.cart.create({ data: { userId: user.id } });

    if (env.REQUIRE_EMAIL_VERIFICATION) {
      const code = await issueOtp(user.id, OtpPurpose.EMAIL_VERIFICATION);
      const tpl = mailTemplates.verifyEmail(user.name, code);
      await sendMail({ to: user.email, ...tpl });
    }

    const requiresVerification = env.REQUIRE_EMAIL_VERIFICATION;
    const session = requiresVerification ? null : await issueSession(user, device);

    return {
      requiresVerification,
      user: await findPublicUserById(user.id),
      ...session,
    };
  },

  async login(input: { email: string; password: string }, device: DeviceInfo) {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
      include: { role: { select: { name: true, permissions: true } } },
    });

    // Same generic message whether the email is unknown or the password is
    // wrong, so login cannot be used to enumerate registered addresses.
    if (!user || !(await comparePassword(input.password, user.passwordHash))) {
      throw ApiError.unauthorized('Incorrect email or password');
    }

    if (!user.isActive) throw ApiError.forbidden('This account has been deactivated. Contact support.');

    if (env.REQUIRE_EMAIL_VERIFICATION && !user.emailVerified) {
      const code = await issueOtp(user.id, OtpPurpose.EMAIL_VERIFICATION);
      await sendMail({ to: user.email, ...mailTemplates.verifyEmail(user.name, code) });
      throw new ApiError(403, 'Please verify your email first -- a new code has been sent', 'EMAIL_NOT_VERIFIED');
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const session = await issueSession(user, device);
    return { user: await findPublicUserById(user.id), ...session };
  },

  async verifyEmail(email: string, otp: string, device: DeviceInfo) {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { role: { select: { name: true, permissions: true } } },
    });
    if (!user) throw ApiError.badRequest('Incorrect code');

    await consumeOtp(user.id, OtpPurpose.EMAIL_VERIFICATION, otp);
    await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } });

    const session = await issueSession(user, device);
    return { user: await findPublicUserById(user.id), ...session };
  },

  async resendOtp(email: string, purpose: OtpPurpose) {
    const user = await prisma.user.findUnique({ where: { email } });
    // Do not reveal whether the address is registered.
    if (!user) return;
    if (purpose === OtpPurpose.EMAIL_VERIFICATION && user.emailVerified) return;

    const code = await issueOtp(user.id, purpose);
    const tpl =
      purpose === OtpPurpose.EMAIL_VERIFICATION
        ? mailTemplates.verifyEmail(user.name, code)
        : mailTemplates.passwordReset(user.name, code);
    await sendMail({ to: user.email, ...tpl });
  },

  async forgotPassword(email: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      logger.info({ email }, 'password reset requested for unknown email');
      return; // silent success -- avoids account enumeration
    }
    const code = await issueOtp(user.id, OtpPurpose.PASSWORD_RESET);
    await sendMail({ to: user.email, ...mailTemplates.passwordReset(user.name, code) });
  },

  async resetPassword(email: string, otp: string, newPassword: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw ApiError.badRequest('Incorrect code');

    await consumeOtp(user.id, OtpPurpose.PASSWORD_RESET, otp);
    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    // Revoke every existing session -- a password reset should log out all devices.
    await prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await sendMail({ to: user.email, ...mailTemplates.passwordChanged(user.name) });
  },

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await comparePassword(currentPassword, user.passwordHash))) {
      throw ApiError.badRequest('Current password is incorrect');
    }
    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    await prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await sendMail({ to: user.email, ...mailTemplates.passwordChanged(user.name) });
  },

  async refresh(refreshToken: string, device: DeviceInfo) {
    const payload = verifyRefreshToken(refreshToken);
    const tokenHash = sha256(refreshToken);

    const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date() || stored.userId !== payload.sub) {
      // Reusing a revoked/expired token is treated as possible token theft --
      // nuke every session for this user as a precaution.
      if (stored && !stored.revokedAt) {
        await prisma.refreshToken.updateMany({ where: { userId: stored.userId }, data: { revokedAt: new Date() } });
      }
      throw ApiError.unauthorized('Session expired, please sign in again');
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: { role: { select: { name: true, permissions: true } } },
    });
    if (!user || !user.isActive) throw ApiError.unauthorized();

    // Rotate: revoke the used token and issue a brand new pair.
    await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
    const session = await issueSession(user, device);
    return { user: await findPublicUserById(user.id), ...session };
  },

  async logout(refreshToken: string | undefined) {
    if (!refreshToken) return;
    await prisma.refreshToken
      .updateMany({ where: { tokenHash: sha256(refreshToken), revokedAt: null }, data: { revokedAt: new Date() } })
      .catch(() => undefined);
  },

  async me(userId: string) {
    return findPublicUserById(userId);
  },

  async updateProfile(userId: string, input: { name?: string; phone?: string; avatarUrl?: string }) {
    const data: Record<string, unknown> = {};
    if (input.name) data.name = input.name;
    if (input.phone !== undefined) data.phone = input.phone || null;
    if (input.avatarUrl !== undefined) data.avatarUrl = input.avatarUrl || null;
    await prisma.user.update({ where: { id: userId }, data });
    return findPublicUserById(userId);
  },
};

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { ApiError } from '../../lib/ApiError';
import { asyncHandler, created, noContent, ok } from '../../lib/http';
import { requireAuth } from '../../middleware/auth';
import { validate, idParam, safeText, phoneSchema, pincodeSchema } from '../../middleware/validate';

export const addressRouter = Router();
addressRouter.use(requireAuth);

const addressBody = z.object({
  label: safeText(30).optional().default('Home'),
  fullName: safeText(80, 2),
  phone: phoneSchema,
  line1: safeText(160, 4),
  line2: safeText(160).optional().or(z.literal('')),
  landmark: safeText(120).optional().or(z.literal('')),
  city: safeText(60, 2),
  state: safeText(60, 2),
  pincode: pincodeSchema,
  country: safeText(60).optional().default('India'),
  isDefault: z.coerce.boolean().optional().default(false),
});

/** Only one address per user may be the default; enforced in a transaction. */
async function setDefault(userId: string, addressId: string) {
  await prisma.$transaction([
    prisma.address.updateMany({ where: { userId, NOT: { id: addressId } }, data: { isDefault: false } }),
    prisma.address.update({ where: { id: addressId }, data: { isDefault: true } }),
  ]);
}

async function assertOwnership(userId: string, addressId: string) {
  const address = await prisma.address.findUnique({ where: { id: addressId }, select: { userId: true } });
  if (!address) throw ApiError.notFound('Address not found');
  if (address.userId !== userId) throw ApiError.forbidden();
}

addressRouter.get(
  '/',
  asyncHandler(async (req, res) =>
    ok(
      res,
      await prisma.address.findMany({
        where: { userId: req.user!.sub },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      }),
    ),
  ),
);

addressRouter.post(
  '/',
  validate({ body: addressBody }),
  asyncHandler(async (req, res) => {
    const userId = req.user!.sub;
    const count = await prisma.address.count({ where: { userId } });
    if (count >= 10) throw ApiError.badRequest('You can save at most 10 addresses');

    const address = await prisma.address.create({
      data: {
        userId,
        ...req.body,
        line2: req.body.line2 || null,
        landmark: req.body.landmark || null,
        // The very first address is always the default.
        isDefault: count === 0 ? true : req.body.isDefault,
      },
    });

    if (address.isDefault) await setDefault(userId, address.id);
    return created(res, address);
  }),
);

addressRouter.patch(
  '/:id',
  validate({ params: idParam, body: addressBody.partial() }),
  asyncHandler(async (req, res) => {
    await assertOwnership(req.user!.sub, req.params.id);
    const address = await prisma.address.update({ where: { id: req.params.id }, data: req.body });
    if (req.body.isDefault) await setDefault(req.user!.sub, address.id);
    return ok(res, await prisma.address.findUniqueOrThrow({ where: { id: address.id } }));
  }),
);

addressRouter.post(
  '/:id/default',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    await assertOwnership(req.user!.sub, req.params.id);
    await setDefault(req.user!.sub, req.params.id);
    return ok(res, { message: 'Default address updated' });
  }),
);

addressRouter.delete(
  '/:id',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const userId = req.user!.sub;
    await assertOwnership(userId, req.params.id);

    const wasDefault = (await prisma.address.findUniqueOrThrow({ where: { id: req.params.id } })).isDefault;
    // Orders keep a frozen `shipTo` snapshot, so deleting an address is safe:
    // the FK is nullable and set to null.
    await prisma.address.delete({ where: { id: req.params.id } });

    if (wasDefault) {
      const next = await prisma.address.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
      if (next) await setDefault(userId, next.id);
    }
    return noContent(res);
  }),
);

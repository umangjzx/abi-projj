import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { asyncHandler, created, ok } from '../../lib/http';
import { requireAuth } from '../../middleware/auth';
import { requireAdmin } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { deleteImage, uploadImage } from '../../lib/storage';
import { ApiError } from '../../lib/ApiError';
import { env } from '../../config/env';

export const uploadRouter = Router();

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

/**
 * In-memory storage: files go straight to Cloudinary (or the local uploads
 * folder) without ever being written to a temp path. The 5 MB cap and MIME
 * allow-list are the first line of defence; `uploadImage` re-encodes through
 * Cloudinary's pipeline when configured.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 8 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED.has(file.mimetype)) {
      cb(new ApiError(400, `Unsupported image type "${file.mimetype}". Use JPEG, PNG, WebP or AVIF.`));
      return;
    }
    cb(null, true);
  },
});

// Uploading is an admin capability -- customers never upload files in this app.
uploadRouter.use(requireAuth, requireAdmin);

uploadRouter.post(
  '/image',
  upload.single('image'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw ApiError.badRequest('No image provided (send a multipart field named "image")');
    const folder = typeof req.body?.folder === 'string' ? sanitizeFolder(req.body.folder) : 'products';
    const stored = await uploadImage(req.file.buffer, req.file.originalname, folder);
    return created(res, stored);
  }),
);

uploadRouter.post(
  '/images',
  upload.array('images', 8),
  asyncHandler(async (req, res) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!files.length) throw ApiError.badRequest('No images provided (send a multipart field named "images")');

    const folder = typeof req.body?.folder === 'string' ? sanitizeFolder(req.body.folder) : 'products';
    const stored = await Promise.all(files.map((file) => uploadImage(file.buffer, file.originalname, folder)));
    return created(res, stored);
  }),
);

uploadRouter.delete(
  '/',
  validate({ body: z.object({ publicId: z.string().min(1) }) }),
  asyncHandler(async (req, res) => {
    await deleteImage(req.body.publicId);
    return ok(res, { deleted: true });
  }),
);

uploadRouter.get('/config', (_req, res) =>
  ok(res, {
    provider: env.cloudinaryEnabled ? 'cloudinary' : 'local',
    maxFileSizeMb: 5,
    maxFiles: 8,
    allowedTypes: [...ALLOWED],
  }),
);

/** Folder names come from the client, so restrict them to a safe charset. */
const sanitizeFolder = (value: string) =>
  value.replace(/[^a-z0-9-_]/gi, '').slice(0, 40) || 'products';

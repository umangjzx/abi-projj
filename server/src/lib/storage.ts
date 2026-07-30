import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env';
import { logger } from './logger';

/**
 * Image storage abstraction. Uses Cloudinary when credentials are present and
 * otherwise falls back to the local `uploads/` directory, so the app runs
 * end-to-end without third-party accounts during development.
 */
if (env.cloudinaryEnabled) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  logger.info('Cloudinary storage enabled');
} else {
  logger.warn('Cloudinary not configured -- falling back to local disk storage (uploads/)');
}

export const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');

export interface StoredFile {
  url: string;
  publicId: string | null;
  provider: 'cloudinary' | 'local';
  width?: number;
  height?: number;
  bytes?: number;
}

export async function uploadImage(
  buffer: Buffer,
  originalName: string,
  folder = 'products',
): Promise<StoredFile> {
  if (env.cloudinaryEnabled) {
    const result = await new Promise<Record<string, any>>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            folder: `${env.CLOUDINARY_FOLDER}/${folder}`,
            resource_type: 'image',
            transformation: [{ quality: 'auto:good', fetch_format: 'auto' }],
          },
          (error, res) => (error || !res ? reject(error ?? new Error('Upload failed')) : resolve(res as any)),
        )
        .end(buffer);
    });

    return {
      url: result.secure_url,
      publicId: result.public_id,
      provider: 'cloudinary',
      width: result.width,
      height: result.height,
      bytes: result.bytes,
    };
  }

  const dir = path.join(UPLOAD_DIR, folder);
  fs.mkdirSync(dir, { recursive: true });
  const ext = path.extname(originalName).toLowerCase() || '.jpg';
  const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
  fs.writeFileSync(path.join(dir, filename), buffer);

  return {
    url: `/uploads/${folder}/${filename}`,
    publicId: `${folder}/${filename}`,
    provider: 'local',
    bytes: buffer.byteLength,
  };
}

export async function deleteImage(publicId: string | null | undefined): Promise<void> {
  if (!publicId) return;
  try {
    if (env.cloudinaryEnabled) {
      await cloudinary.uploader.destroy(publicId);
      return;
    }
    const filePath = path.join(UPLOAD_DIR, publicId);
    // Guard against path traversal via a crafted publicId.
    if (!filePath.startsWith(UPLOAD_DIR)) return;
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (err) {
    logger.warn({ err, publicId }, 'failed to delete image');
  }
}

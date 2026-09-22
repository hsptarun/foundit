import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { requireAuth } from './auth';
import {
  getSupabaseAdmin,
  isSupabaseConfigured,
  isSupabaseAdmin,
  getSupabaseConfigError,
  ITEM_IMAGES_BUCKET,
} from '../supabase';
import { logSecurityEvent } from '../db';
import {
  claimUploadSlot,
  confirmUpload,
  releaseClaim,
} from '../imageUploadLimits';

/**
 * Item image upload — Supabase Storage integration.
 *
 * The existing SQLite auth (`requireAuth`) still identifies the user;
 * nothing about the auth system changes. Uploads are performed server-side
 * with the Supabase admin client so RLS does not need anon write access.
 *
 * When Supabase env vars are not yet configured, the route returns
 * 503 with a clear message; the frontend falls back to local preview
 * so the existing upload UI keeps working.
 */

const router = Router();

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']);

// Memory storage: files are streamed straight to Supabase Storage —
// never written to the local disk and never kept in React state as base64.
const upload = multer({
  storage: multer.memoryStorage(),
  // Phase 2A: at most ONE image per request (enforced by multer BEFORE parsing
  // more than 2 files, and re-checked explicitly below for a precise 400).
  limits: { fileSize: MAX_IMAGE_BYTES, files: 2 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, WEBP, GIF or HEIC images are allowed.'));
    }
  },
});

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

function publicUrlFor(path: string): string {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  return `${url}/storage/v1/object/public/${ITEM_IMAGES_BUCKET}/${path}`;
}

router.post(
  '/item-images',
  requireAuth,
  upload.array('images', 1), // Phase 2A: exactly ONE image per request
  async (req: Request, res: Response) => {
    const { ip, ua } = {
      ip: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown',
      ua: req.headers['user-agent'] || 'unknown',
    };
    const user = (req as any).user as { id: string; email: string } | undefined;

    if (!isSupabaseConfigured()) {
      return res.status(503).json({
        error: 'Image storage is not configured yet.',
        detail: getSupabaseConfigError(),
        fallback: 'local-preview',
      });
    }

    const files = (req.files as Express.Multer.File[]) || [];
    if (files.length === 0) {
      return res.status(400).json({ error: 'No image file provided. Use field name "images".' });
    }

    // Phase 2A: strictly ONE image per request — reject instead of silently
    // uploading multiple.
    if (files.length > 1) {
      logSecurityEvent('IMAGE_UPLOAD_MULTIPLE_REJECTED', user!.id, ip, ua, { count: files.length });
      return res.status(400).json({ error: 'Only one image per upload is allowed.' });
    }

    // Phase 2A: server-side 1 image/hour/user limit. The slot is claimed
    // atomically (SQLite BEGIN IMMEDIATE) from the session-verified user id —
    // never from frontend-supplied data. Released if the upload fails.
    const window = claimUploadSlot(user!.id);
    if (!window.allowed) {
      logSecurityEvent('IMAGE_UPLOAD_RATE_LIMITED', user!.id, ip, ua, {
        retryAfterMs: Math.ceil(window.retryAfterMs / 1000) * 1000,
      });
      res.setHeader('Retry-After', String(Math.ceil(window.retryAfterMs / 1000)));
      return res.status(429).json({
        error: 'Image upload limit reached. You can upload another image after the 1-hour limit resets.',
      });
    }

    try {
      const supabase = getSupabaseAdmin();
      const uploaded: {
        id: string;
        storage_path: string;
        image_url: string;
        item_id: string | null;
      }[] = [];

      for (const file of files) {
        // Phase 2A: exactly one file — the request has already been limited to
        // a single image above; the loop remains only to keep this code block
        // structurally unchanged.
        if (uploaded.length >= 1) break;

        const ext = EXT_BY_MIME[file.mimetype] || 'jpg';
        const storagePath = `items/${user!.id}/${crypto.randomUUID()}.${ext}`;

        const { error: uploadErr } = await supabase.storage
          .from(ITEM_IMAGES_BUCKET)
          .upload(storagePath, file.buffer, {
            contentType: file.mimetype,
            cacheControl: '31536000',
            upsert: false,
          });

        if (uploadErr) {
          console.error('[UPLOAD_STORAGE_ERROR]', uploadErr);
          logSecurityEvent('IMAGE_UPLOAD_FAILED', user!.id, ip, ua, { reason: uploadErr.message });
          releaseClaim(user!.id); // failed upload must NOT consume the 1-hour allowance
          return res.status(502).json({ error: `Storage upload failed: ${uploadErr.message}` });
        }

        const imageUrl = publicUrlFor(storagePath);

        // If the client already created the item, link immediately;
        // otherwise return the reference so it can be saved with the report.
        const itemId = typeof req.body?.item_id === 'string' ? req.body.item_id : null;
        let imageId = crypto.randomUUID();

        if (itemId && isSupabaseAdmin()) {
          const { data, error: dbErr } = await supabase
            .from('item_images')
            .insert({
              item_id: itemId,
              storage_path: storagePath,
              image_url: imageUrl,
              is_primary: uploaded.length === 0,
            })
            .select('id')
            .single();
          if (!dbErr && data) imageId = data.id;
        }

        uploaded.push({ id: imageId, storage_path: storagePath, image_url: imageUrl, item_id: itemId });
      }

      logSecurityEvent('IMAGE_UPLOADED', user!.id, ip, ua, { count: uploaded.length });

      // Phase 2A: the 1-hour window starts ONLY after a successful upload.
      if (uploaded.length > 0) {
        confirmUpload(user!.id);
      }

      res.status(201).json({
        success: true,
        images: uploaded,
      });
    } catch (err: any) {
      console.error('[UPLOAD_ERROR]', err?.message || err);
      releaseClaim(user!.id); // failed upload must NOT consume the 1-hour allowance
      res.status(500).json({ error: 'Image upload failed unexpectedly.' });
    }
  }
);

/**
 * Delete an uploaded image (owner only, verified via SQLite session).
 * Removes both the storage object and the item_images row.
 */
router.delete('/item-images/:imageId', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user as { id: string };
  const { imageId } = req.params;

  if (!isSupabaseAdmin()) {
    return res.status(503).json({ error: 'Image storage is not configured yet.' });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: row, error: fetchErr } = await supabase
      .from('item_images')
      .select('id, storage_path, item_id, items(reporter_id)')
      .eq('id', imageId)
      .single();

    if (fetchErr || !row) {
      return res.status(404).json({ error: 'Image not found.' });
    }

    const reporterId = (row as any).items?.reporter_id;
    if (reporterId && reporterId !== user.id) {
      return res.status(403).json({ error: 'You can only delete images from your own reports.' });
    }

    await supabase.storage.from(ITEM_IMAGES_BUCKET).remove([row.storage_path]);
    await supabase.from('item_images').delete().eq('id', imageId);

    res.json({ success: true });
  } catch (err: any) {
    console.error('[IMAGE_DELETE_ERROR]', err?.message || err);
    res.status(500).json({ error: 'Failed to delete image.' });
  }
});

// Router-level error handler: turn multer rejections (bad MIME, file too
// large, too many files) into honest 400 responses with a clear message
// instead of the generic 500 from the global error handler.
router.use(
  (err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err?.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Image exceeds the 5 MB size limit.' });
    }
    if (err?.code === 'LIMIT_FILE_COUNT' || err?.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ error: 'Only one image per upload is allowed.' });
    }
    if (err instanceof Error && /JPEG, PNG, WEBP/.test(err.message)) {
      return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Image upload failed unexpectedly.' });
  }
);

export default router;

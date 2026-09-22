import { Router, Request, Response } from 'express';
import { requireAuth } from './auth';
import {
  listItems,
  getPublicItem,
  getItemForReporter,
  createItem,
  updateItem,
  deleteItem,
  CreateQuestionInput,
} from '../appData';
import { logSecurityEvent } from '../db';

/**
 * Item report API — persistent lost/found items (Supabase; dev fallback while
 * Supabase credentials are absent).
 *
 * SECURITY:
 *  - GET endpoints return ONLY public shapes (no correct answers, no private
 *    question text — just question_count).
 *  - POST/PATCH/DELETE require the existing SQLite session (requireAuth).
 *  - reporter_id is ALWAYS taken from the server-verified session user,
 *    never from the request body.
 *  - All submitted data is validated server-side.
 */

const router = Router();

const TIME_PRECISIONS = ['exact', 'approximate', 'unknown'] as const;
const STATUSES = [
  'active',
  'matched',
  'verification_pending',
  'verified',
  'returned',
  'closed',
] as const;
const QUESTION_TYPES = ['text', 'multiple_choice', 'yes_no'] as const;

function isNonEmptyString(v: unknown, maxLen: number): v is string {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= maxLen;
}

function sanitizeText(v: unknown, maxLen: number, fallback = ''): string {
  if (typeof v !== 'string') return fallback;
  return v.trim().slice(0, maxLen);
}

function validateQuestions(raw: unknown): CreateQuestionInput[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw)) throw new Error('questions must be an array.');
  if (raw.length > 10) throw new Error('A maximum of 10 verification questions is allowed.');

  return raw.map((q: any) => {
    if (!isNonEmptyString(q?.question, 300)) {
      throw new Error('Each verification question needs text (max 300 chars).');
    }
    if (!QUESTION_TYPES.includes(q?.question_type)) {
      throw new Error('question_type must be text, multiple_choice, or yes_no.');
    }
    if (!isNonEmptyString(q?.correct_answer, 300)) {
      throw new Error('Each question needs a correct answer (max 300 chars).');
    }

    let options: string[] | null = null;
    if (q.question_type === 'multiple_choice') {
      if (!Array.isArray(q?.options) || q.options.length < 2 || q.options.length > 8) {
        throw new Error('multiple_choice questions need 2–8 options.');
      }
      options = q.options.map((o: unknown) => sanitizeText(o, 120)).filter(Boolean);
      if (options.length < 2) throw new Error('multiple_choice needs at least 2 valid options.');
    }

    const weight = q?.weight === 2 ? 2 : 1;

    return {
      question: q.question.trim().slice(0, 300),
      question_type: q.question_type,
      options,
      correct_answer: q.correct_answer.trim().slice(0, 300),
      weight,
      required: q?.required === false ? false : true,
      is_private: true, // always private, regardless of client input
    };
  });
}

function validateItemDate(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'string') throw new Error('item_date_time must be an ISO date string.');
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw new Error('item_date_time is not a valid date.');
  // Sanity window: 1 year back, 1 day forward.
  const now = Date.now();
  const t = d.getTime();
  if (t < now - 366 * 24 * 3600_000 || t > now + 24 * 3600_000) {
    throw new Error('item_date_time must be within the past year (or at most tomorrow).');
  }
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// GET /api/items — public listing
// ---------------------------------------------------------------------------
router.get('/', async (req: Request, res: Response) => {
  try {
    const { type, status, mine, limit } = req.query;

    if (type && type !== 'lost' && type !== 'found') {
      return res.status(400).json({ error: 'type must be "lost" or "found".' });
    }
    if (status && typeof status === 'string' && !STATUSES.includes(status as any)) {
      return res.status(400).json({ error: 'Invalid status filter.' });
    }

    let reporterId: string | undefined;
    if (mine === 'true') {
      const user = (req as any).user as { id: string } | undefined;
      if (!user) {
        return res.status(401).json({ error: 'Sign in to view your own reports.' });
      }
      reporterId = user.id;
    }

    const parsedLimit =
      typeof limit === 'string' && Number.isInteger(Number(limit))
        ? Math.min(Math.max(Number(limit), 1), 200)
        : undefined;

    const items = await listItems({
      type: (type as 'lost' | 'found') || undefined,
      status: (status as string) || undefined,
      reporterId,
      limit: parsedLimit,
    });

    // Default feed hides closed items unless explicitly requested.
    const visible = status ? items : items.filter((it) => it.status !== 'closed');

    res.json({ items: visible });
  } catch (err: any) {
    console.error('[ITEMS_LIST_ERROR]', err?.message || err);
    res.status(500).json({ error: 'Failed to load items.' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/items — create report (auth required)
// ---------------------------------------------------------------------------
router.post('/', requireAuth, async (req: Request, res: Response) => {
  const { ip, ua } = {
    ip: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown',
    ua: req.headers['user-agent'] || 'unknown',
  };
  const user = (req as any).user as { id: string; email: string };

  try {
    const body = req.body ?? {};

    // --- Validation ---
    if (body.type !== 'lost' && body.type !== 'found') {
      return res.status(400).json({ error: 'type must be "lost" or "found".' });
    }
    if (!isNonEmptyString(body.title, 120)) {
      return res.status(400).json({ error: 'Title is required (max 120 characters).' });
    }
    if (!isNonEmptyString(body.category, 80)) {
      return res.status(400).json({ error: 'Category is required.' });
    }
    if (!isNonEmptyString(body.location, 200)) {
      return res.status(400).json({ error: 'Location is required (max 200 characters).' });
    }
    if (body.time_precision !== undefined && !TIME_PRECISIONS.includes(body.time_precision)) {
      return res.status(400).json({ error: 'time_precision must be exact, approximate, or unknown.' });
    }

    // reporter_id comes from the SESSION — a client-supplied value is ignored
    // and logged as a security event.
    if (body.reporter_id && body.reporter_id !== user.id) {
      logSecurityEvent('ITEM_REPORTER_ID_MISMATCH', user.id, ip, ua, {
        claimed: String(body.reporter_id).slice(0, 40),
      });
    }

    const questions = validateQuestions(body.questions);

    const item = await createItem({
      reporterId: user.id, // server-verified
      type: body.type,
      title: body.title.trim().slice(0, 120),
      category: body.category.trim().slice(0, 80),
      description: sanitizeText(body.description, 2000),
      item_date_time: validateItemDate(body.item_date_time),
      time_precision: body.time_precision ?? 'approximate',
      location: body.location.trim().slice(0, 200),
      distinguishing_features: sanitizeText(body.distinguishing_features, 1000),
      reward: isNonEmptyString(body.reward, 60) ? body.reward.trim().slice(0, 60) : null,
      questions,
      images: Array.isArray(body.images)
        ? body.images
            .filter(
              (im: any) =>
                im && isNonEmptyString(im.storage_path, 400) && isNonEmptyString(im.image_url, 500)
            )
            .slice(0, 5)
            .map((im: any) => ({ storage_path: im.storage_path, image_url: im.image_url }))
        : undefined,
    });

    logSecurityEvent('ITEM_CREATED', user.id, ip, ua, { item_id: item.id, type: item.type });
    res.status(201).json({ item });
  } catch (err: any) {
    if (err?.message?.includes('must be') || err?.message?.includes('required')) {
      return res.status(400).json({ error: err.message });
    }
    console.error('[ITEM_CREATE_ERROR]', err?.message || err);
    res.status(500).json({ error: 'Failed to create item report.' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/items/:id — public detail (no private data)
// ---------------------------------------------------------------------------
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const item = await getPublicItem(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found.' });
    res.json({ item });
  } catch (err: any) {
    console.error('[ITEM_GET_ERROR]', err?.message || err);
    res.status(500).json({ error: 'Failed to load item.' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/items/:id/full — reporter-only detail incl. own questions
// ---------------------------------------------------------------------------
router.get('/:id/full', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user as { id: string };
  try {
    const item = await getItemForReporter(req.params.id, user.id);
    if (!item) return res.status(404).json({ error: 'Item not found or not yours.' });
    res.json({ item });
  } catch (err: any) {
    console.error('[ITEM_GET_FULL_ERROR]', err?.message || err);
    res.status(500).json({ error: 'Failed to load item.' });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/items/:id — edit own report (auth required)
// ---------------------------------------------------------------------------
router.patch('/:id', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user as { id: string };

  try {
    const body = req.body ?? {};
    const patch: Record<string, unknown> = {};

    if (body.title !== undefined) {
      if (!isNonEmptyString(body.title, 120)) {
        return res.status(400).json({ error: 'Title is required (max 120 characters).' });
      }
      patch.title = body.title.trim().slice(0, 120);
    }
    if (body.category !== undefined) {
      if (!isNonEmptyString(body.category, 80)) {
        return res.status(400).json({ error: 'Category is required.' });
      }
      patch.category = body.category.trim().slice(0, 80);
    }
    if (body.description !== undefined) patch.description = sanitizeText(body.description, 2000);
    if (body.distinguishing_features !== undefined) {
      patch.distinguishing_features = sanitizeText(body.distinguishing_features, 1000);
    }
    if (body.location !== undefined) {
      if (!isNonEmptyString(body.location, 200)) {
        return res.status(400).json({ error: 'Location is required (max 200 characters).' });
      }
      patch.location = body.location.trim().slice(0, 200);
    }
    if (body.item_date_time !== undefined) {
      patch.item_date_time = await validateItemDate(body.item_date_time);
    }
    if (body.time_precision !== undefined) {
      if (!TIME_PRECISIONS.includes(body.time_precision)) {
        return res.status(400).json({ error: 'time_precision must be exact, approximate, or unknown.' });
      }
      patch.time_precision = body.time_precision;
    }
    if (body.status !== undefined) {
      if (!STATUSES.includes(body.status)) {
        return res.status(400).json({ error: 'Invalid status value.' });
      }
      patch.status = body.status;
    }
    if (body.reward !== undefined) {
      patch.reward = isNonEmptyString(body.reward, 60) ? body.reward.trim().slice(0, 60) : null;
    }

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update.' });
    }

    const item = await updateItem(req.params.id, user.id, patch as any);
    if (!item) return res.status(404).json({ error: 'Item not found or not yours.' });

    res.json({ item });
  } catch (err: any) {
    console.error('[ITEM_UPDATE_ERROR]', err?.message || err);
    res.status(500).json({ error: 'Failed to update item.' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/items/:id — delete own report (auth required)
// ---------------------------------------------------------------------------
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  const { ip, ua } = {
    ip: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown',
    ua: req.headers['user-agent'] || 'unknown',
  };
  const user = (req as any).user as { id: string };

  try {
    const deleted = await deleteItem(req.params.id, user.id);
    if (!deleted) return res.status(404).json({ error: 'Item not found or not yours.' });

    logSecurityEvent('ITEM_DELETED', user.id, ip, ua, { item_id: req.params.id });
    res.json({ success: true });
  } catch (err: any) {
    console.error('[ITEM_DELETE_ERROR]', err?.message || err);
    res.status(500).json({ error: 'Failed to delete item.' });
  }
});

export default router;

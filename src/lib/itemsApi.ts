/**
 * Items API client — loads and creates persistent item reports from the
 * FoundIt backend (Supabase via the server; dev fallback while Supabase
 * credentials are absent).
 *
 * The server returns ONLY public item shapes: verification questions are
 * represented by a count, never by content, and correct answers never
 * cross the network.
 */

import { LostFoundItem, ItemStatus } from '../types';

export interface PublicItemDto {
  id: string;
  reporter_id: string | null;
  type: 'lost' | 'found';
  title: string;
  category: string;
  description: string;
  item_date_time: string | null;
  time_precision: 'exact' | 'approximate' | 'unknown';
  time_display: string;
  location: string;
  distinguishing_features: string;
  status: 'active' | 'matched' | 'verification_pending' | 'verified' | 'returned' | 'closed';
  reward: string | null;
  created_at: string;
  updated_at: string;
  images: { id: string; image_url: string; is_primary: boolean }[];
  question_count: number;
}

/** Neutral placeholder shown while a report has no persisted image. */
const FALLBACK_IMAGE_URL =
  'https://images.unsplash.com/photo-1584652868574-0669f4292976?auto=format&fit=crop&w=800&q=80';

/** Server lifecycle statuses → the UI's ItemStatus union. */
const STATUS_TO_UI: Record<PublicItemDto['status'], ItemStatus> = {
  active: 'active',
  matched: 'matched',
  verification_pending: 'matched',
  verified: 'matched',
  returned: 'returned',
  closed: 'claimed',
};

/**
 * Demo seed item ids → match confidence from the former INITIAL_ITEMS mock.
 * Kept client-side temporarily until the matching phase computes real scores.
 */
const SEED_MATCH_CONFIDENCE: Record<string, number> = {
  'a0000000-0000-4000-8000-000000000001': 97, // wallet (found)
  'b0000000-0000-4000-8000-000000000001': 97, // wallet counterpart (lost)
  'a0000000-0000-4000-8000-000000000002': 89, // keys (lost)
  'b0000000-0000-4000-8000-000000000002': 89, // keys counterpart (found)
  'a0000000-0000-4000-8000-000000000003': 92, // glasses (found)
  'b0000000-0000-4000-8000-000000000003': 92, // glasses counterpart (lost)
  'a0000000-0000-4000-8000-000000000004': 94, // backpack (lost)
  'b0000000-0000-4000-8000-000000000004': 94, // backpack counterpart (found)
  'a0000000-0000-4000-8000-000000000005': 95, // airpods (found)
  'b0000000-0000-4000-8000-000000000005': 95, // airpods counterpart (lost)
  'a0000000-0000-4000-8000-000000000006': 96, // cat (lost)
  'b0000000-0000-4000-8000-000000000006': 96, // cat counterpart (found)
};

export function mapPublicItem(dto: PublicItemDto): LostFoundItem {
  const primaryImage = dto.images.find((im) => im.is_primary) ?? dto.images[0];
  return {
    id: dto.id,
    title: dto.title,
    category: dto.category,
    type: dto.type,
    location: dto.location,
    timeAgo: dto.time_display || 'Recently',
    status: STATUS_TO_UI[dto.status] ?? 'active',
    description: dto.description || 'No additional features specified.',
    imageUrl: primaryImage?.image_url || FALLBACK_IMAGE_URL,
    reward: dto.reward ?? undefined,
    matchConfidence:
      dto.status === 'matched' ? SEED_MATCH_CONFIDENCE[dto.id] ?? undefined : undefined,
    // verificationQuestions / counterpart intentionally omitted: private data
    // now lives server-only. The verification modal falls back to category
    // suggestions (existing workflow, unchanged).
  };
}

/** Fetch the CSRF token (server also sets the cookie). */
async function fetchCsrfToken(): Promise<string | null> {
  try {
    const res = await fetch('/api/auth/csrf', { credentials: 'include' });
    if (!res.ok) return null;
    const data = await res.json();
    return data.csrfToken ?? null;
  } catch {
    return null;
  }
}

/** Mutating request helper that satisfies the server CSRF check. */
async function csrfFetch(url: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) {
  const token = await fetchCsrfToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['x-csrf-token'] = token;

  const res = await fetch(url, {
    method,
    headers,
    credentials: 'include',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return res;
}

export interface ItemsLoadResult {
  items: LostFoundItem[];
  error: string | null;
}

export async function fetchItems(): Promise<ItemsLoadResult> {
  try {
    const res = await fetch('/api/items?limit=200', { credentials: 'include' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { items: [], error: data.error || `Failed to load items (${res.status})` };
    }
    const data = await res.json();
    const items: LostFoundItem[] = (data.items ?? []).map(mapPublicItem);
    return { items, error: null };
  } catch {
    return { items: [], error: 'Could not reach the FoundIt server. Is it running?' };
  }
}

export interface CreateItemPayload {
  type: 'lost' | 'found';
  title: string;
  category: string;
  description?: string;
  item_date_time?: string | null;
  time_precision?: 'exact' | 'approximate' | 'unknown';
  location: string;
  distinguishing_features?: string;
  questions?: {
    question: string;
    question_type: 'text' | 'multiple_choice' | 'yes_no';
    options?: string[] | null;
    correct_answer: string;
    weight?: number;
    required?: boolean;
    is_private?: boolean;
  }[];
  images?: { storage_path: string; image_url: string }[];
}

export async function createItemReport(
  payload: CreateItemPayload
): Promise<{ success: boolean; item?: LostFoundItem; error?: string; needsAuth?: boolean }> {
  try {
    const res = await csrfFetch('/api/items', 'POST', payload);
    const data = await res.json().catch(() => ({}));

    if (res.status === 401) {
      return { success: false, needsAuth: true, error: 'Please sign in to publish a report.' };
    }
    if (!res.ok) {
      return { success: false, error: data.error || `Failed to save report (${res.status})` };
    }
    return { success: true, item: mapPublicItem(data.item) };
  } catch {
    return { success: false, error: 'Could not reach the FoundIt server. Is it running?' };
  }
}

/** Best-effort status update (used when an item is returned after verification). */
export async function updateItemStatus(
  itemId: string,
  status: 'returned' | 'active' | 'matched' | 'closed'
): Promise<boolean> {
  try {
    const res = await csrfFetch(`/api/items/${itemId}`, 'PATCH', { status });
    return res.ok;
  } catch {
    return false;
  }
}

import crypto from 'crypto';
import {
  getSupabaseAdmin,
  isSupabaseConfigured,
  isSupabaseAdmin,
  ITEM_IMAGES_BUCKET,
} from './supabase';
import { devStore } from './devStore';
import { DEMO_SEED, DEMO_SEED_VERSION, DEMO_PAIRS, SeedItemRow } from './demoSeed';

/**
 * FoundIt application-data layer.
 *
 * Two backends, ONE interface:
 *  - Supabase (production path) when SUPABASE_URL + key are configured.
 *  - Dev JSON store (data/foundit_app_dev.json) ONLY as a local-development
 *    fallback while credentials are absent, so item persistence and the
 *    refresh test work today. It is bypassed entirely once Supabase is set.
 *
 * SECURITY RULES enforced here:
 *  - Public listings NEVER include verification_questions.correct_answer or
 *    any other private verification data.
 *  - reporter_id always comes from the server-verified SQLite session —
 *    never from the browser.
 */

export type Backend = 'supabase' | 'dev-fallback';

export function activeBackend(): Backend {
  return isSupabaseConfigured() ? 'supabase' : 'dev-fallback';
}

export function isAppDataReady(): boolean {
  return isSupabaseConfigured();
}

export function publicImageUrl(storagePath: string): string {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  return `${url}/storage/v1/object/public/${ITEM_IMAGES_BUCKET}/${storagePath}`;
}

// ============================================================================
// Public shapes (never contain correct answers)
// ============================================================================

export interface PublicItemImage {
  id: string;
  image_url: string;
  is_primary: boolean;
}

export interface PublicItem {
  id: string;
  reporter_id: string | null;
  type: 'lost' | 'found';
  title: string;
  category: string;
  description: string;
  item_date_time: string | null;
  time_precision: 'exact' | 'approximate' | 'unknown';
  time_display: string; // human-readable, derived server-side
  location: string;
  distinguishing_features: string;
  status: string;
  reward: string | null;
  created_at: string;
  updated_at: string;
  images: PublicItemImage[];
  question_count: number; // count only — never the questions themselves
}

// ============================================================================
// time_display helper (replaces the mock `timeAgo` strings)
// ============================================================================

export function timeAgoFrom(iso: string | null): string {
  if (!iso) return 'Recently';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.floor(diffMs / 60_000));
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

// ============================================================================
// Supabase backend
// ============================================================================

function sbPublicSelect(): string {
  return `
    id, reporter_id, type, title, category, description, item_date_time,
    time_precision, location, distinguishing_features, status, reward,
    created_at, updated_at,
    item_images ( id, image_url, is_primary ),
    verification_questions ( id )
  `;
}

function sbToPublicItem(row: any): PublicItem {
  return {
    id: row.id,
    reporter_id: row.reporter_id ?? null,
    type: row.type,
    title: row.title,
    category: row.category,
    description: row.description ?? '',
    item_date_time: row.item_date_time ?? null,
    time_precision: row.time_precision ?? 'approximate',
    time_display: timeAgoFrom(row.item_date_time ?? row.created_at),
    location: row.location,
    distinguishing_features: row.distinguishing_features ?? '',
    status: row.status,
    reward: row.reward ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    images: (row.item_images ?? []).map((im: any) => ({
      id: im.id,
      image_url: im.image_url,
      is_primary: Boolean(im.is_primary),
    })),
    question_count: (row.verification_questions ?? []).length,
  };
}

const sb = () => getSupabaseAdmin();

// ============================================================================
// Public API of the data layer
// ============================================================================

export function listItems(options?: {
  type?: 'lost' | 'found';
  status?: string;
  reporterId?: string;
  limit?: number;
}): Promise<PublicItem[]> {
  if (activeBackend() === 'supabase') {
    return listItemsSupabase(options);
  }
  return Promise.resolve(listItemsDev(options));
}

async function listItemsSupabase(options?: {
  type?: 'lost' | 'found';
  status?: string;
  reporterId?: string;
  limit?: number;
}): Promise<PublicItem[]> {
  let query = sb()
    .from('items')
    .select(sbPublicSelect())
    .order('created_at', { ascending: false });

  if (options?.type) query = query.eq('type', options.type);
  if (options?.status) query = query.eq('status', options.status);
  if (options?.reporterId) query = query.eq('reporter_id', options.reporterId);

  const { data, error } = await query.limit(options?.limit ?? 200);
  if (error) throw new Error(`Failed to list items: ${error.message}`);
  return (data ?? []).map(sbToPublicItem);
}

function listItemsDev(options?: {
  type?: 'lost' | 'found';
  status?: string;
  reporterId?: string;
  limit?: number;
}): PublicItem[] {
  let rows = devStore.listItems();
  if (options?.type) rows = rows.filter((r) => r.type === options!.type);
  if (options?.status) rows = rows.filter((r) => r.status === options!.status);
  if (options?.reporterId) rows = rows.filter((r) => r.reporter_id === options!.reporterId);

  return rows.slice(0, options?.limit ?? 200).map((row) => ({
    id: row.id,
    reporter_id: row.reporter_id ?? null,
    type: row.type,
    title: row.title,
    category: row.category,
    description: row.description ?? '',
    item_date_time: row.item_date_time ?? null,
    time_precision: row.time_precision ?? 'approximate',
    time_display: timeAgoFrom(row.item_date_time ?? row.created_at),
    location: row.location,
    distinguishing_features: row.distinguishing_features ?? '',
    status: row.status,
    reward: row.reward ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    images: devStore.listImagesByItem(row.id).map((im) => ({
      id: im.id,
      image_url: im.image_url,
      is_primary: Boolean(im.is_primary),
    })),
    question_count: devStore.listQuestionsByItem(row.id).length,
  }));
}

// ----------------------------------------------------------------------------

export async function getPublicItem(itemId: string): Promise<PublicItem | null> {
  if (activeBackend() === 'supabase') {
    const { data, error } = await sb()
      .from('items')
      .select(sbPublicSelect())
      .eq('id', itemId)
      .single();
    if (error || !data) return null;
    return sbToPublicItem(data);
  }
  const rows = listItemsDev();
  return rows.find((r) => r.id === itemId) ?? null;
}

/**
 * Reporter-only detail: includes THIS reporter's own verification questions
 * (with correct answers) for editing. Ownership is checked server-side.
 */
export async function getItemForReporter(
  itemId: string,
  reporterId: string
): Promise<(PublicItem & { questions: any[] }) | null> {
  const base = await (async () => {
    if (activeBackend() === 'supabase') {
      const { data, error } = await sb()
        .from('items')
        .select(sbPublicSelect())
        .eq('id', itemId)
        .eq('reporter_id', reporterId)
        .single();
      if (error || !data) return null;
      return sbToPublicItem(data);
    }
    const row = devStore.getItem(itemId);
    if (!row || row.reporter_id !== reporterId) return null;
    const [pub] = listItemsDev({ reporterId }).filter((r) => r.id === itemId);
    return pub ?? null;
  })();

  if (!base) return null;

  const questions = await (async () => {
    if (activeBackend() === 'supabase') {
      const { data } = await sb()
        .from('verification_questions')
        .select('id, question, question_type, options, correct_answer, weight, required, is_private')
        .eq('item_id', itemId)
        .order('created_at', { ascending: true });
      return data ?? [];
    }
    return devStore.listQuestionsByItem(itemId);
  })();

  return { ...base, questions };
}

// ----------------------------------------------------------------------------

export interface CreateQuestionInput {
  question: string;
  question_type: 'text' | 'multiple_choice' | 'yes_no';
  options?: string[] | null;
  correct_answer: string;
  weight?: number;
  required?: boolean;
  is_private?: boolean;
}

export interface CreateItemInput {
  reporterId: string; // from server-verified session — NEVER from body
  type: 'lost' | 'found';
  title: string;
  category: string;
  description?: string;
  item_date_time?: string | null;
  time_precision?: 'exact' | 'approximate' | 'unknown';
  location: string;
  distinguishing_features?: string;
  reward?: string | null;
  questions?: CreateQuestionInput[];
  images?: { storage_path: string; image_url: string }[];
}

export async function createItem(input: CreateItemInput): Promise<PublicItem> {
  const nowIso = new Date().toISOString();
  const itemRow = {
    reporter_id: input.reporterId,
    type: input.type,
    title: input.title,
    category: input.category,
    description: input.description ?? '',
    item_date_time: input.item_date_time ?? null,
    time_precision: input.time_precision ?? 'approximate',
    location: input.location,
    distinguishing_features: input.distinguishing_features ?? '',
    status: 'active',
    reward: input.reward ?? null,
  };

  if (activeBackend() === 'supabase') {
    const { data: item, error } = await sb()
      .from('items')
      .insert(itemRow)
      .select('*')
      .single();
    if (error) throw new Error(`Failed to create item: ${error.message}`);

    if (input.questions?.length) {
      const { error: qErr } = await sb().from('verification_questions').insert(
        input.questions.map((q) => ({
          item_id: item.id,
          question: q.question,
          question_type: q.question_type,
          options: q.options ?? null,
          correct_answer: q.correct_answer,
          weight: q.weight ?? 1,
          required: q.required ?? true,
          is_private: q.is_private ?? true,
        }))
      );
      if (qErr) throw new Error(`Failed to save questions: ${qErr.message}`);
    }

    if (input.images?.length) {
      const { error: imgErr } = await sb().from('item_images').insert(
        input.images.map((img, idx) => ({
          item_id: item.id,
          storage_path: img.storage_path,
          image_url: img.image_url,
          is_primary: idx === 0,
        }))
      );
      if (imgErr) throw new Error(`Failed to save images: ${imgErr.message}`);
    }

    const pub = await getPublicItem(item.id);
    if (!pub) throw new Error('Item created but could not be read back.');
    return pub;
  }

  // dev fallback
  const row = devStore.insertItem({
    id: crypto.randomUUID(),
    ...itemRow,
    created_at: nowIso,
    updated_at: nowIso,
  });

  if (input.questions?.length) {
    devStore.insertQuestions(
      input.questions.map((q) => ({ item_id: row.id, ...q }))
    );
  }
  if (input.images?.length) {
    input.images.forEach((img, idx) => {
      devStore.insertImage({ item_id: row.id, ...img, is_primary: idx === 0 });
    });
  }

  const pub = listItemsDev().find((r) => r.id === row.id);
  if (!pub) throw new Error('Item created but could not be read back.');
  return pub;
}

// ----------------------------------------------------------------------------

export type UpdateItemPatch = Partial<{
  title: string;
  category: string;
  description: string;
  item_date_time: string | null;
  time_precision: 'exact' | 'approximate' | 'unknown';
  location: string;
  distinguishing_features: string;
  status: 'active' | 'matched' | 'verification_pending' | 'verified' | 'returned' | 'closed';
  reward: string | null;
}>;

export async function updateItem(
  itemId: string,
  reporterId: string,
  patch: UpdateItemPatch
): Promise<PublicItem | null> {
  if (activeBackend() === 'supabase') {
    const { data, error } = await sb()
      .from('items')
      .update(patch)
      .eq('id', itemId)
      .eq('reporter_id', reporterId) // ownership enforced server-side
      .select('*')
      .single();
    if (error || !data) return null;
    return getPublicItem(itemId);
  }
  const row = devStore.getItem(itemId);
  if (!row || row.reporter_id !== reporterId) return null;
  devStore.updateItem(itemId, patch);
  return listItemsDev().find((r) => r.id === itemId) ?? null;
}

export async function deleteItem(itemId: string, reporterId: string): Promise<boolean> {
  if (activeBackend() === 'supabase') {
    // Verify ownership first so we can also clean the storage objects.
    const { data: row } = await sb()
      .from('items')
      .select('id, reporter_id')
      .eq('id', itemId)
      .eq('reporter_id', reporterId)
      .single();
    if (!row) return false;

    const { data: imgs } = await sb()
      .from('item_images')
      .select('storage_path')
      .eq('item_id', itemId);

    const { error } = await sb().from('items').delete().eq('id', itemId);
    if (error) throw new Error(`Failed to delete item: ${error.message}`);

    // Best-effort cleanup of storage objects.
    if (imgs?.length) {
      await sb()
        .storage.from(ITEM_IMAGES_BUCKET)
        .remove(imgs.map((im) => im.storage_path).filter(Boolean));
    }
    return true;
  }
  // dev fallback
  const existingRow = devStore.getItem(itemId);
  if (!existingRow || existingRow.reporter_id !== reporterId) return false;
  return devStore.deleteItem(itemId);
}

// ----------------------------------------------------------------------------
// Matching rows are NOT part of this phase; only the demo pairs helper used by
// the seeder lives here.
// ----------------------------------------------------------------------------

async function seedDemoPairsSupabase(itemIds: Set<string>): Promise<void> {
  for (const pair of DEMO_PAIRS) {
    if (!itemIds.has(pair.lost_item_id) || !itemIds.has(pair.found_item_id)) continue;
    await sb().from('matches').upsert(
      {
        lost_item_id: pair.lost_item_id,
        found_item_id: pair.found_item_id,
        status: 'verified',
        overall_score: 95,
      },
      { onConflict: 'lost_item_id,found_item_id' }
    );
  }
}

// ============================================================================
// IDEMPOTENT DEMO SEED (replaces INITIAL_ITEMS as source of truth)
// ============================================================================

export async function seedDemoItems(): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;
  const insertedIds = new Set<string>();

  if (activeBackend() === 'supabase') {
    for (const { item } of DEMO_SEED) {
      const { data: existing } = await sb()
        .from('items')
        .select('id')
        .eq('id', item.id)
        .maybeSingle();

      if (existing) {
        skipped++;
        insertedIds.add(item.id);
        continue;
      }

      const { error } = await sb().from('items').insert(rowFromSeed(item));
      if (error) {
        console.error(`[SEED] Failed to insert item ${item.id}:`, error.message);
        continue;
      }
      insertedIds.add(item.id);
      inserted++;
    }

    // Questions for freshly inserted items only.
    for (const { item, questions } of DEMO_SEED) {
      if (!insertedIds.has(item.id) || questions.length === 0) continue;
      const { error } = await sb().from('verification_questions').insert(
        questions.map((q) => ({
          id: q.id,
          item_id: item.id,
          question: q.question,
          question_type: q.question_type,
          options: q.options,
          correct_answer: q.correct_answer,
          weight: q.weight,
          required: q.required,
          is_private: q.is_private,
        }))
      );
      if (error) console.error(`[SEED] Questions failed for ${item.id}:`, error.message);
    }

    await seedDemoPairsSupabase(insertedIds);
    return { inserted, skipped };
  }

  // ---- dev fallback seeding ----
  for (const { item, questions } of DEMO_SEED) {
    if (devStore.getItem(item.id)) {
      skipped++;
      continue;
    }
    devStore.insertItem(rowFromSeed(item));
    if (questions.length > 0) devStore.insertQuestions(questions.map((q) => ({ item_id: item.id, ...q })));
    inserted++;
  }
  for (const pair of DEMO_PAIRS) {
    if (devStore.getItem(pair.lost_item_id) && devStore.getItem(pair.found_item_id)) {
      devStore.insertMatch({ ...pair, status: 'verified', overall_score: 95 });
    }
  }
  devStore.setMeta('demo_seed_version', DEMO_SEED_VERSION);
  return { inserted, skipped };
}

function rowFromSeed(item: SeedItemRow): Record<string, any> {
  return {
    id: item.id,
    reporter_id: item.reporter_id,
    type: item.type,
    title: item.title,
    category: item.category,
    description: item.description,
    item_date_time: item.item_date_time,
    time_precision: item.time_precision,
    location: item.location,
    distinguishing_features: item.distinguishing_features,
    status: item.status,
    reward: item.reward,
    created_at: item.created_at,
    updated_at: item.updated_at,
  };
}

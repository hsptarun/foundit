import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * DEV-FALLBACK STORE (local development only).
 *
 * Active ONLY while Supabase credentials are absent in .env. It mimics the
 * Supabase tables (identical row shapes) and persists to
 * data/foundit_app_dev.json so the mandatory refresh-persistence test can be
 * executed before credentials exist. The moment SUPABASE_URL + a key are set,
 * this file is never loaded — all operations go to Supabase instead.
 *
 * NOT for production: single-process, synchronous I/O, no RLS. Data is
 * sandboxed in its own file and never touches the SQLite auth database.
 */

const DB_PATH = path.resolve(process.cwd(), 'data', 'foundit_app_dev.json');

interface DevDb {
  items: Record<string, any>[];
  item_images: Record<string, any>[];
  verification_questions: Record<string, any>[];
  matches: Record<string, any>[];
  verification_attempts: Record<string, any>[];
  meta: Record<string, any>;
}

function emptyDb(): DevDb {
  return {
    items: [],
    item_images: [],
    verification_questions: [],
    matches: [],
    verification_attempts: [],
    meta: {},
  };
}

let cache: DevDb | null = null;

function load(): DevDb {
  if (cache) return cache;
  try {
    if (fs.existsSync(DB_PATH)) {
      cache = { ...emptyDb(), ...JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')) };
      return cache;
    }
  } catch (err) {
    console.warn('[DEV_STORE] Could not read dev store, starting fresh:', err);
  }
  cache = emptyDb();
  return cache;
}

function save(): void {
  try {
    if (!fs.existsSync(path.dirname(DB_PATH))) {
      fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    }
    fs.writeFileSync(DB_PATH, JSON.stringify(cache, null, 2));
  } catch (err) {
    console.error('[DEV_STORE] Write failed:', err);
  }
}

function uuid(): string {
  return crypto.randomUUID();
}

export const devStore = {
  // ---- items ----
  listItems(): Record<string, any>[] {
    return [...load().items].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  },

  getItem(id: string): Record<string, any> | null {
    return load().items.find((i) => i.id === id) ?? null;
  },

  insertItem(row: Record<string, any>): Record<string, any> {
    const db = load();
    db.items.push(row);
    save();
    return row;
  },

  updateItem(id: string, patch: Record<string, any>): Record<string, any> | null {
    const db = load();
    const idx = db.items.findIndex((i) => i.id === id);
    if (idx === -1) return null;
    db.items[idx] = { ...db.items[idx], ...patch, updated_at: new Date().toISOString() };
    save();
    return db.items[idx];
  },

  deleteItem(id: string): boolean {
    const db = load();
    const before = db.items.length;
    db.items = db.items.filter((i) => i.id !== id);
    db.item_images = db.item_images.filter((im) => im.item_id !== id);
    db.verification_questions = db.verification_questions.filter((q) => q.item_id !== id);
    save();
    return db.items.length < before;
  },

  // ---- item_images ----
  listImagesByItem(itemId: string): Record<string, any>[] {
    return load().item_images.filter((im) => im.item_id === itemId);
  },

  insertImage(row: Partial<Record<string, any>>): Record<string, any> {
    const full = {
      id: uuid(),
      item_id: row.item_id ?? null,
      storage_path: row.storage_path ?? '',
      image_url: row.image_url ?? '',
      is_primary: row.is_primary ?? false,
      created_at: new Date().toISOString(),
    };
    const db = load();
    db.item_images.push(full);
    save();
    return full;
  },

  updateImage(id: string, patch: Record<string, any>): void {
    const db = load();
    const idx = db.item_images.findIndex((im) => im.id === id);
    if (idx !== -1) {
      db.item_images[idx] = { ...db.item_images[idx], ...patch };
      save();
    }
  },

  // ---- verification_questions ----
  listQuestionsByItem(itemId: string): Record<string, any>[] {
    return load().verification_questions.filter((q) => q.item_id === itemId);
  },

  insertQuestions(rows: Record<string, any>[]): Record<string, any>[] {
    const db = load();
    const full = rows.map((r) => ({
      id: r.id ?? uuid(),
      item_id: r.item_id,
      question: r.question,
      question_type: r.question_type,
      options: r.options ?? null,
      correct_answer: r.correct_answer,
      weight: r.weight ?? 1,
      required: r.required ?? true,
      is_private: r.is_private ?? true,
      created_at: new Date().toISOString(),
    }));
    db.verification_questions.push(...full);
    save();
    return full;
  },

  // ---- matches ----
  insertMatch(row: Record<string, any>): Record<string, any> {
    const db = load();
    const exists = db.matches.find(
      (m) => m.lost_item_id === row.lost_item_id && m.found_item_id === row.found_item_id
    );
    if (exists) return exists;
    const full = {
      id: row.id ?? uuid(),
      lost_item_id: row.lost_item_id,
      found_item_id: row.found_item_id,
      visual_score: row.visual_score ?? null,
      location_score: row.location_score ?? null,
      time_score: row.time_score ?? null,
      description_score: row.description_score ?? null,
      overall_score: row.overall_score ?? null,
      status: row.status ?? 'candidate',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db.matches.push(full);
    save();
    return full;
  },

  // ---- meta (seed bookkeeping) ----
  getMeta(key: string): any {
    return load().meta[key] ?? null;
  },

  setMeta(key: string, value: any): void {
    const db = load();
    db.meta[key] = value;
    save();
  },

  /** Clear all application data (does NOT touch the SQLite auth database). */
  reset(): void {
    cache = emptyDb();
    save();
  },
};

/** Test helper: generate ids in the same format as Supabase uuids. */
export const devUuid = uuid;

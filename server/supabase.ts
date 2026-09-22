import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Server-side Supabase client (single instance, reused by all server routes).
 *
 * - Uses SUPABASE_SERVICE_ROLE_KEY when available (bypasses RLS — server only,
 *   NEVER shipped to the browser and NEVER imported from src/).
 * - Falls back to the anon key otherwise (uploads then rely on RLS policies).
 * - When no Supabase env vars are configured at all, `isSupabaseConfigured()`
 *   returns false and routes degrade gracefully (local preview mode) instead
 *   of crashing, so the app keeps working before credentials are added.
 */

const supabaseUrl =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && (supabaseServiceKey || supabaseAnonKey));
}

export function isSupabaseAdmin(): boolean {
  return Boolean(supabaseUrl && supabaseServiceKey);
}

export function getSupabaseConfigError(): string | null {
  if (!supabaseUrl) return 'SUPABASE_URL is not configured.';
  if (!supabaseServiceKey && !supabaseAnonKey) {
    return 'SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) is not configured.';
  }
  return null;
}

let cachedClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error(getSupabaseConfigError());
  }
  if (!cachedClient) {
    cachedClient = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey, {
      auth: {
        // The identity system is the existing SQLite auth; Supabase Auth is not used.
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  return cachedClient;
}

/** Storage bucket used for item photos. */
export const ITEM_IMAGES_BUCKET = 'item-images';

/** Server-side identity of the app, stamped into created rows for RLS auditability. */
export const APP_ACTOR = 'server';

// Re-export for typing convenience in route files.
export type { SupabaseClient };

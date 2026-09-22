import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Browser-side Supabase client (single instance, reused app-wide).
 *
 * Uses ONLY the publishable/anon key. The service-role key must never appear
 * in frontend code or VITE_* variables — RLS policies on the Supabase project
 * are the security boundary for everything this client can touch.
 *
 * Returns null while SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not configured,
 * so the UI can fall back to local preview mode without crashing.
 */

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export function isSupabaseBrowserConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

let cachedClient: SupabaseClient | null = null;

export function getSupabaseBrowser(): SupabaseClient | null {
  if (!isSupabaseBrowserConfigured()) return null;
  if (!cachedClient) {
    cachedClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        // FoundIt identity lives in the existing SQLite auth system.
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  return cachedClient;
}

/** Public URL for an object stored in the item-images bucket. */
export function getItemImageUrl(storagePath: string): string {
  if (!supabaseUrl) return '';
  return `${supabaseUrl}/storage/v1/object/public/${'item-images'}/${storagePath}`;
}

export type { SupabaseClient };

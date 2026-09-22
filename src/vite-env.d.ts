/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID: string;
  /** Supabase project URL (public). */
  readonly VITE_SUPABASE_URL: string;
  /** Supabase publishable/anon key (public — NOT the service-role key). */
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

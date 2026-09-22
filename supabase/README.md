# FoundIt — Supabase Setup Guide

The database foundation (schema, RLS policies, storage bucket config, server
utilities) is fully implemented and dormant until you add credentials. Nothing
breaks meanwhile: the app runs in **local-preview mode** and Google login /
SQLite auth work exactly as before.

## 1. Create the Supabase project

1. Go to https://supabase.com → **New project** (any name, e.g. `foundit`).
2. Save the database password somewhere safe.
3. When the project is ready, open **Settings → API**.

## 2. Add credentials to `.env`

From Settings → API, copy these into the Supabase section of your `.env`
(the keys already exist there — just fill in the values):

```
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=eyJ...            # publishable/anon key
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...       # same anon key
SUPABASE_SERVICE_ROLE_KEY=eyJ...    # SECRET — server only, never VITE_*
```

Then restart `npm run dev:all` so both processes pick them up.

## 3. Create the schema

1. Open **Supabase Dashboard → SQL Editor → New query**.
2. Paste the entire contents of `supabase/schema.sql` and **Run**.
3. Expected result: "Success. No rows returned." This creates:

   | Table | Purpose |
   |---|---|
   | `items` | lost/found reports (public feed) |
   | `item_images` | image references per item |
   | `verification_questions` | private Q&A — **no public read policy** |
   | `matches` | lost↔found links with component scores |
   | `verification_attempts` | submissions + scores (server-recorded) |
   | `messages` | per-match coordination channel |
   | `handoffs` | return logistics per match |

   Plus the `item-images` **storage bucket** (public read) and all RLS policies.

## 4. Verify

```bash
curl http://localhost:3001/api/health
# → "database": { "sqliteAuth": "connected", "supabase": "configured (service role)" }
```

Upload an image while signed in → it lands in Supabase **Storage → item-images**
and a row appears in `item_images`. Without credentials or when signed out,
the existing local preview is used and nothing breaks.

## Security summary

- The **service-role key never reaches the browser** — it's read only in
  `server/supabase.ts` (no `VITE_` prefix, not in `vite.config.ts` `define`).
- `verification_questions` and `verification_attempts` have **no anon SELECT
  policy** — correct answers and attempt data are never publicly readable.
- Public anon access is **read-only** on `items` / `item_images` /
  `storage.objects`; every write goes through the authenticated server
  (session-verified) or, later, through `authenticated` RLS policies.
- The SQLite auth DB (`data/foundit_auth.db`, `users`, `sessions`,
  `verification_tokens`, `audit_logs`) is **untouched** — `items.reporter_id`
  stores the existing SQLite `users.id`.

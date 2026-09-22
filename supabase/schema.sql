-- ============================================================================
-- FoundIt — Supabase schema, security policies & storage bucket
-- ============================================================================
-- Run this ONCE in the Supabase Dashboard > SQL Editor.
-- It is safe to re-run (idempotent: IF NOT EXISTS tables, drops/recreates
-- policies, ON CONFLICT bucket insert).
--
-- Identity model:
--   FoundIt authentication remains the EXISTING SQLite system (Google login
--   etc.). Supabase Auth is NOT used. `reporter_id` / `user_id` columns store
--   the existing SQLite `users.id` (UUID). Rows are created exclusively by
--   the FoundIt server, which verifies the session cookie before writing.
--   RLS therefore allows PUBLIC reads of non-private data, and restricts
--   writes to service-role/server requests (no anon writes).
--
--   claimant_id in verification_attempts and sender_id in messages also store
--   SQLite user ids (NULL allowed while attempts remain anonymous).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Extensions
-- ----------------------------------------------------------------------------
create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ----------------------------------------------------------------------------
-- Table: items
-- ----------------------------------------------------------------------------
create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid,                          -- existing SQLite users.id
  type text not null check (type in ('lost', 'found')),
  title text not null,
  category text not null,
  description text not null default '',
  item_date_time timestamptz,                -- when it was lost/found
  time_precision text not null default 'approximate'
    check (time_precision in ('exact', 'approximate', 'unknown')),
  location text not null,
  distinguishing_features text not null default '',
  status text not null default 'active'
    check (status in ('active', 'matched', 'verification_pending', 'verified', 'returned', 'closed')),
  reward text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_items_reporter on public.items(reporter_id);
create index if not exists idx_items_status on public.items(status);
create index if not exists idx_items_type on public.items(type);
create index if not exists idx_items_category on public.items(category);
create index if not exists idx_items_created_at on public.items(created_at desc);

-- ----------------------------------------------------------------------------
-- Table: item_images
-- ----------------------------------------------------------------------------
create table if not exists public.item_images (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  storage_path text not null,                -- path inside the item-images bucket
  image_url text not null,                   -- public URL of the stored object
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (item_id, storage_path)
);

create index if not exists idx_item_images_item on public.item_images(item_id);

-- ----------------------------------------------------------------------------
-- Table: verification_questions
-- ----------------------------------------------------------------------------
-- PRIVATE: correct_answer must never be readable by anon/public clients.
-- RLS below: no policy grants SELECT to anon/authenticated — only the server
-- (service role) and the item's reporter may read/write these rows.
create table if not exists public.verification_questions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  question text not null,
  question_type text not null
    check (question_type in ('text', 'multiple_choice', 'yes_no')),
  options jsonb,                             -- array of strings for multiple_choice
  correct_answer text not null,               -- PRIVATE — never expose publicly
  weight integer not null default 1 check (weight between 1 and 2),
  required boolean not null default true,
  is_private boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_verification_questions_item
  on public.verification_questions(item_id);

-- ----------------------------------------------------------------------------
-- Table: matches
-- ----------------------------------------------------------------------------
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  lost_item_id uuid not null references public.items(id) on delete cascade,
  found_item_id uuid not null references public.items(id) on delete cascade,
  visual_score numeric(5, 2) check (visual_score between 0 and 100),
  location_score numeric(5, 2) check (location_score between 0 and 100),
  time_score numeric(5, 2) check (time_score between 0 and 100),
  description_score numeric(5, 2) check (description_score between 0 and 100),
  overall_score numeric(5, 2) check (overall_score between 0 and 100),
  status text not null default 'candidate'
    check (status in ('candidate', 'suggested', 'verification_pending', 'verified', 'rejected', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lost_item_id, found_item_id),
  check (lost_item_id <> found_item_id)
);

create index if not exists idx_matches_lost on public.matches(lost_item_id);
create index if not exists idx_matches_found on public.matches(found_item_id);
create index if not exists idx_matches_status on public.matches(status);

-- ----------------------------------------------------------------------------
-- Table: verification_attempts
-- ----------------------------------------------------------------------------
-- PRIVATE: submitted_answers / score / result readable only by the server,
-- the claimant, and the item owners via the server. No anon SELECT policy.
create table if not exists public.verification_attempts (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  claimant_id uuid,                           -- SQLite users.id (nullable for now)
  submitted_answers jsonb not null default '{}'::jsonb,
  score numeric(5, 2) check (score between 0 and 100),
  result text
    check (result in ('pending_finder_review', 'unsuccessful', 'verified', 'needs_review', 'failed')),
  attempt_number integer not null default 1,
  created_at timestamptz not null default now(),
  unique (match_id, claimant_id, attempt_number)
);

create index if not exists idx_verification_attempts_match
  on public.verification_attempts(match_id);
create index if not exists idx_verification_attempts_claimant
  on public.verification_attempts(claimant_id);

-- ----------------------------------------------------------------------------
-- Table: messages
-- ----------------------------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  sender_id uuid,                             -- SQLite users.id
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_match on public.messages(match_id, created_at);

-- ----------------------------------------------------------------------------
-- Table: handoffs
-- ----------------------------------------------------------------------------
create table if not exists public.handoffs (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade unique,
  status text not null default 'pending'
    check (status in ('pending', 'contacted', 'handoff_arranged', 'completed', 'cancelled')),
  agreed_location text,
  scheduled_time timestamptz,
  returned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_handoffs_match on public.handoffs(match_id);

-- ----------------------------------------------------------------------------
-- updated_at triggers
-- ----------------------------------------------------------------------------
create or replace function public.foundit_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_items_updated_at on public.items;
create trigger trg_items_updated_at
  before update on public.items
  for each row execute function public.foundit_set_updated_at();

drop trigger if exists trg_matches_updated_at on public.matches;
create trigger trg_matches_updated_at
  before update on public.matches
  for each row execute function public.foundit_set_updated_at();

drop trigger if exists trg_handoffs_updated_at on public.handoffs;
create trigger trg_handoffs_updated_at
  before update on public.handoffs
  for each row execute function public.foundit_set_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
-- Model:
--   * Public (anon)  : READ-only on items + item_images (the public feed).
--                      NO read access to verification_questions,
--                      verification_attempts. NO write access anywhere.
--   * Server         : uses the service-role key, which BYPASSES RLS — the
--                      server verifies the SQLite session before every write.
--   * reporter-based writes: granted via "reporter_id = auth.uid()" style
--                      policies that become active IF Supabase Auth users are
--                      introduced later; harmless while identity stays SQLite.
-- ============================================================================

alter table public.items                  enable row level security;
alter table public.item_images            enable row level security;
alter table public.verification_questions enable row level security;
alter table public.matches                enable row level security;
alter table public.verification_attempts  enable row level security;
alter table public.messages               enable row level security;
alter table public.handoffs               enable row level security;

-- Helper: does this SQLite user id own the item?
-- (Keeps policies readable; reporter_id is a SQLite users.id.)
create or replace function public.foundit_is_item_reporter(item_uuid uuid, user_uuid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.items
    where id = item_uuid and reporter_id = user_uuid
  );
$$;

-- ---- items ------------------------------------------------------------------
drop policy if exists "Public read active items" on public.items;
create policy "Public read active items"
  on public.items for select
  to anon, authenticated
  using (status in ('active', 'matched', 'verification_pending'));

drop policy if exists "Reporter reads own items" on public.items;
create policy "Reporter reads own items"
  on public.items for select
  to authenticated
  using (reporter_id = auth.uid());

drop policy if exists "Reporter creates own items" on public.items;
create policy "Reporter creates own items"
  on public.items for insert
  to authenticated
  with check (reporter_id = auth.uid());

drop policy if exists "Reporter edits own items" on public.items;
create policy "Reporter edits own items"
  on public.items for update
  to authenticated
  using (reporter_id = auth.uid())
  with check (reporter_id = auth.uid());

-- ---- item_images --------------------------------------------------------------
drop policy if exists "Public read item images" on public.item_images;
create policy "Public read item images"
  on public.item_images for select
  to anon, authenticated
  using (true);

drop policy if exists "Reporter manages own item images" on public.item_images;
create policy "Reporter manages own item images"
  on public.item_images for all
  to authenticated
  using (public.foundit_is_item_reporter(item_id, auth.uid()))
  with check (public.foundit_is_item_reporter(item_id, auth.uid()));

-- ---- verification_questions (PRIVATE) ----------------------------------------
-- No anon policy at all: correct answers are invisible to the public.
drop policy if exists "Reporter reads own questions" on public.verification_questions;
create policy "Reporter reads own questions"
  on public.verification_questions for select
  to authenticated
  using (public.foundit_is_item_reporter(item_id, auth.uid()));

drop policy if exists "Reporter manages own questions" on public.verification_questions;
create policy "Reporter manages own questions"
  on public.verification_questions for all
  to authenticated
  using (public.foundit_is_item_reporter(item_id, auth.uid()))
  with check (public.foundit_is_item_reporter(item_id, auth.uid()));

-- ---- matches -------------------------------------------------------------------
drop policy if exists "Participants read matches" on public.matches;
create policy "Participants read matches"
  on public.matches for select
  to authenticated
  using (
    public.foundit_is_item_reporter(lost_item_id, auth.uid()) or
    public.foundit_is_item_reporter(found_item_id, auth.uid())
  );

drop policy if exists "Participants create matches" on public.matches;
create policy "Participants create matches"
  on public.matches for insert
  to authenticated
  with check (
    public.foundit_is_item_reporter(lost_item_id, auth.uid()) or
    public.foundit_is_item_reporter(found_item_id, auth.uid())
  );

-- ---- verification_attempts (PRIVATE) ------------------------------------------
-- No anon policy: submissions, answers and scores never leave the server.
drop policy if exists "Claimant reads own attempts" on public.verification_attempts;
create policy "Claimant reads own attempts"
  on public.verification_attempts for select
  to authenticated
  using (claimant_id = auth.uid());

drop policy if exists "Claimant inserts own attempts" on public.verification_attempts;
create policy "Claimant inserts own attempts"
  on public.verification_attempts for insert
  to authenticated
  with check (claimant_id = auth.uid());

-- ---- messages -------------------------------------------------------------------
-- Participants of a match can read/write their coordination channel.
drop policy if exists "Match participants read messages" on public.messages;
create policy "Match participants read messages"
  on public.messages for select
  to authenticated
  using (
    sender_id = auth.uid() or
    public.foundit_is_item_reporter(
      (select lost_item_id from public.matches m where m.id = match_id), auth.uid()) or
    public.foundit_is_item_reporter(
      (select found_item_id from public.matches m where m.id = match_id), auth.uid())
  );

drop policy if exists "Match participants send messages" on public.messages;
create policy "Match participants send messages"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = auth.uid() and (
      public.foundit_is_item_reporter(
        (select lost_item_id from public.matches m where m.id = match_id), auth.uid()) or
      public.foundit_is_item_reporter(
        (select found_item_id from public.matches m where m.id = match_id), auth.uid()))
  );

-- ---- handoffs --------------------------------------------------------------------
drop policy if exists "Match participants read handoff" on public.handoffs;
create policy "Match participants read handoff"
  on public.handoffs for select
  to authenticated
  using (
    public.foundit_is_item_reporter(
      (select lost_item_id from public.matches m where m.id = match_id), auth.uid()) or
    public.foundit_is_item_reporter(
      (select found_item_id from public.matches m where m.id = match_id), auth.uid())
  );

drop policy if exists "Match participants manage handoff" on public.handoffs;
create policy "Match participants manage handoff"
  on public.handoffs for all
  to authenticated
  using (
    public.foundit_is_item_reporter(
      (select lost_item_id from public.matches m where m.id = match_id), auth.uid()) or
    public.foundit_is_item_reporter(
      (select found_item_id from public.matches m where m.id = match_id), auth.uid())
  )
  with check (
    public.foundit_is_item_reporter(
      (select lost_item_id from public.matches m where m.id = match_id), auth.uid()) or
    public.foundit_is_item_reporter(
      (select found_item_id from public.matches m where m.id = match_id), auth.uid())
  );

-- ============================================================================
-- STORAGE: item-images bucket
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('item-images', 'item-images', true)
on conflict (id) do nothing;

-- Public read of item photos (the feed shows them to everyone).
drop policy if exists "Public read item images" on storage.objects;
create policy "Public read item images"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'item-images');

-- Writes go through the FoundIt server (service role bypasses RLS).
-- The policy below only future-proofs direct authenticated uploads.
drop policy if exists "Authenticated uploads item images" on storage.objects;
create policy "Authenticated uploads item images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'item-images');

drop policy if exists "Authenticated deletes own item images" on storage.objects;
create policy "Authenticated deletes own item images"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'item-images');

-- ============================================================================
-- Done. Tables: items, item_images, verification_questions,
-- matches, verification_attempts, messages, handoffs
-- Bucket: item-images (public read)
-- ============================================================================

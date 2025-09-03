# 🎨 Happy Doodle — 30-Second Doodle Battles

Two players draw head-to-head for 30 seconds. 🎉 Confetti pops, the drawings are revealed, and the crowd votes (live) to crown a winner. Optional: random silly prompts + a stitched “battle poster” image you can share.

**Live demo:** _add your Vercel URL here_  
**Tech:** Next.js (App Router) • Supabase (Postgres, Realtime, Storage) • TypeScript • Tailwind

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/ericlong12/happy-doodle&env=NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY)

---

## ✨ Features

- **Room creation** with shareable QR codes (Players & Audience)
- **Mobile-friendly drawing** on canvas with finger input
- **30s round timer** + random goofy prompts (local list)
- **Live audience voting** via Supabase Realtime
- **Confetti reveal** + automatic **winner** calc
- **One-click “Share Battle Image”** (stitched canvas → Supabase Storage public URL)
- Works locally and in production (Vercel) — URLs auto-adapt

---

## 🧪 Demo Script (60–90s)

1) Click **Create Room** → show QR codes  
2) Two volunteers scan **Players** QR → **Join LEFT/RIGHT**  
3) Click **Start 30s Round** → call out the **prompt** (shown to players + audience)  
4) At 0s: **confetti** + reveal → audience scans **Vote** QR  
5) Watch the **live bar** update → announce **winner**  
6) **Share Battle Image** → open poster PNG → drop link in chat / AirDrop

---

## 🚀 Quick Start (Local)
```
bash
git clone https://github.com/ericlong12/happy-doodle.git
cd happy-doodle
pnpm install

# Env: copy example and fill in your own Supabase values
cp .env.local.example .env.local
# Edit .env.local:
# NEXT_PUBLIC_SUPABASE_URL="https://YOUR-PROJECT.supabase.co"
# NEXT_PUBLIC_SUPABASE_ANON_KEY="YOUR_ANON_KEY"

pnpm dev
# Open http://localhost:3000 (use the "Network" URL on phones)

```

---

### PART 4 — Supabase Setup (tables, policies, storage)

```markdown
## 🧰 Supabase Setup

Open **Supabase → SQL Editor** and run the following once:

sql
-- Enable extension (for UUIDs)
create extension if not exists "pgcrypto";

-- ROOMS (one per battle)
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open','drawing','reveal','closed')),
  prompt_text text
);

-- VOTES (one per device per room)
create table if not exists public.votes (
  room_id uuid not null references public.rooms(id) on delete cascade,
  voter_hash text not null,
  vote_for text not null check (vote_for in ('left','right')),
  created_at timestamptz not null default now(),
  primary key (room_id, voter_hash)
);

-- Realtime + simple RLS for hackathon (wide open)
alter table public.rooms enable row level security;
alter table public.votes enable row level security;

create policy if not exists "rooms_read"   on public.rooms for select using (true);
create policy if not exists "rooms_write"  on public.rooms for insert with check (true);
create policy if not exists "rooms_update" on public.rooms for update using (true) with check (true);

create policy if not exists "votes_read"   on public.votes for select using (true);
create policy if not exists "votes_write"  on public.votes for insert with check (true);
create policy if not exists "votes_upsert" on public.votes for update using (true) with check (true);


create policy if not exists "public uploads to battles"
on storage.objects
for insert to anon
with check (bucket_id = 'battles');

create policy if not exists "public update in battles"
on storage.objects
for update to anon
using (bucket_id = 'battles')
with check (bucket_id = 'battles');


```
---

### PART 5 — Deploy to Vercel

```markdown
## ☁️ Deploy to Vercel

1) Push this repo to GitHub  
2) Import at https://vercel.com/new → Framework: **Next.js**  
3) Add Environment Variables (Production & Preview):

NEXT_PUBLIC_SUPABASE_URL = https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY = YOUR_ANON_KEY


4) Deploy → open your Vercel URL → **Create Room** → scan QRs → draw → vote → share  
The API builds links from the **request origin**, so it automatically uses your Vercel domain.

---
```

🧱 Architecture

**Next.js (App Router)**  
- `/` → Create Room + QR codes  
- `/room/[id]` → Player canvases, timer, confetti, poster stitching  
- `/vote/[id]` → Audience voting + live bar  
- `/api/room` → inserts a row and returns `{ joinUrl, spectateUrl }` using request origin

**Supabase**  
- Postgres: `rooms`, `votes`  
- Realtime: live subscriptions on votes per room  
- Storage: `battles` bucket (public PNGs)

---

🔧 Config

Create `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL="https://YOUR-PROJECT.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="YOUR_ANON_KEY"

```



---


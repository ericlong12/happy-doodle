Happy Doodle — 30-Second Doodle Battles
Two players draw head-to-head for 30 seconds. 🎉 Confetti pops, the drawings are revealed, and the crowd votes (live) to crown a winner. Optional: random silly prompts + a stitched “battle poster” image you can share.
Live demo: add your Vercel URL here
Tech: Next.js (App Router) • Supabase (Postgres, Realtime, Storage) • TypeScript • Tailwind

Features
Room creation with shareable QR codes (Players & Audience)
Mobile-friendly drawing on canvas with finger input
30s round timer + random goofy prompts (local list)
Live audience voting via Supabase Realtime
Confetti reveal + automatic winner calc
One-click “Share Battle Image” (stitched canvas → Supabase Storage public URL)
Works locally and in production (Vercel) — URLs auto-adapt
Demo Script (60–90s)
Click Create Room → show QR codes
Two volunteers scan Players QR → Join LEFT/RIGHT
Click Start 30s Round → call out the prompt (shown to players + audience)
At 0s: confetti + reveal → audience scans Vote QR
Watch the live bar update → announce winner
Share Battle Image → open poster PNG → drop link in chat / AirDrop
Quick Start (Local)
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
For phones on your LAN: use the Network URL that Next prints (e.g., http://192.168.x.x:3000).
Supabase Setup
Open Supabase → SQL Editor and run the following once:
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
Enable Realtime on the votes table (Tables → votes → toggle Realtime Enabled).
Storage (for battle posters): Supabase → Storage
Create bucket: battles → Public
Policies (SQL Editor):
create policy if not exists "public uploads to battles"
on storage.objects
for insert to anon
with check (bucket_id = 'battles');

create policy if not exists "public update in battles"
on storage.objects
for update to anon
using (bucket_id = 'battles')
with check (bucket_id = 'battles');
☁️ Deploy to Vercel
Push this repo to GitHub
Import at https://vercel.com/new → Framework: Next.js
Add Environment Variables (Production & Preview):
NEXT_PUBLIC_SUPABASE_URL = https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY = YOUR_ANON_KEY
Deploy → open your Vercel URL → Create Room → scan QRs → draw → vote → share
The API builds links from the request origin, so it automatically uses your Vercel domain.
Architecture
Next.js (App Router)
/ → Create Room + QR codes
/room/[id] → Player canvases, timer, confetti, poster stitching
/vote/[id] → Audience voting + live bar
/api/room → inserts a row and returns { joinUrl, spectateUrl } using request origin
Supabase
Postgres: rooms, votes
Realtime: live subscriptions on votes per room
Storage: battles bucket (public PNGs)
🔧 Config
Create .env.local:
NEXT_PUBLIC_SUPABASE_URL="https://YOUR-PROJECT.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="YOUR_ANON_KEY"
No BASE_URL needed; the server figures it out per request.

Vonage SMS/MMS: send the battle poster to a phone (/api/share-sms)
Foxit PDF: generate a “Battle Certificate” PDF (/api/certificate)
Zoom / Webhooks: auto-create a room for break-time games

Troubleshooting
Links show localhost on Vercel: open the Vercel URL (the API uses request origin for links)
“Invalid API key” / 500: check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel envs, then redeploy
No live updates: enable Realtime on votes
Share image fails: make battles bucket Public and apply the two Storage policies above
Screenshots
Add images under public/screenshots/ and link them here:
<!-- ![Home](./public/screenshots/home.png) --> <!-- ![Room](./public/screenshots/room.png) --> <!-- ![Vote](./public/screenshots/vote.png) --> <!-- ![Poster](./public/screenshots/poster.png) -->

Acknowledgments
Built at DevNetwork API + Cloud + Data Hackathon 2025.
Thanks to Supabase for realtime & storage, the Next.js team for great DX, and everyone who doodled with us!

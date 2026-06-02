# Forty

**AI-powered course schedule planning for UT Austin students.** Chat your way to a
conflict-free schedule, compare professors with real ratings and grade data, find GPA
boosters, and build your week — all backed by the actual UT course catalog.

> [!IMPORTANT]
> **Source-available, not open source.** This repository is public for transparency and
> portfolio purposes only. It is **all rights reserved** — you may read the code, but you
> may **not** use, copy, modify, host, deploy, or run it (or any part of it) without
> written permission. See [`LICENSE`](./LICENSE). "Forty" is a trademark of the author.
> The setup notes below document _how it's built_; they are not an invitation to redeploy it.

---

## What it does

- **Conversational scheduling** — "Build me a conflict-free schedule with C S 314, M 408C, and
  an American history class, no classes before 10 AM" → savable weekly-grid cards you can refine
  in chat.
- **Deterministic schedule builder** (`/build`) — pick courses and generate ranked, conflict-free
  schedules with pure logic (no AI, no usage cost).
- **Professor insight** — compare professors by RateMyProfessors rating _and_ historical grade
  distributions / average GPA.
- **GPA boosters & course/professor browse** — structured search over the catalog.
- **Calendar & saved schedules**, account settings, dark mode.
- **Pay-what-you-want credits** — a free trial credit to start, then top up any amount (min $1) via
  Stripe; AI usage debits a prepaid balance at a small markup over real token cost.

## Stack

| Layer     | Tech                                                                                     |
| --------- | ---------------------------------------------------------------------------------------- |
| Frontend  | Next.js 15 (App Router), React 19, Tailwind, shadcn/ui — on Vercel                       |
| Chat / AI | Cloudflare Worker + Vercel AI SDK, Google **Gemini 2.5 Flash** (chat + tool use)         |
| Retrieval | Gemini embeddings + Postgres vector search (RAG over courses/sections/professors/grades) |
| Data      | Supabase — Postgres, Auth (Google OAuth), Row Level Security, Realtime                   |
| Billing   | Stripe (hosted Checkout + webhook)                                                       |

## Architecture

- The browser talks to the **Next.js app** for auth, UI, server actions, and the Stripe webhook.
- Chat requests hit a separate **Cloudflare Worker**, which embeds the query, runs vector search
  over the catalog, and calls Gemini with tools (`buildSchedule`, `getProfessorRating`), streaming
  the answer back with savable schedule/course cards.
- A **pure scheduler** (`lib/scheduler.ts`) does conflict-free generation and ranking; it's shared
  by both the `/build` composer (browser) and the Worker.
- **Usage debits a prepaid credit balance** in the Worker's `onFinish` (token cost × markup); the
  Worker blocks at $0, and the Stripe webhook tops the balance up (idempotent per payment).

## Project layout

```
app/            Next.js routes — chat, build, calendar, courses, professors,
                terms/privacy/refund, api/stripe/webhook
components/      UI (chat, schedule cards, dialogs, account settings)
lib/            Shared logic — scheduler, course parsing, browse RPCs
workers/chat/   The Cloudflare chat Worker (RAG + Gemini + tools + metering)
supabase/       SQL migrations: schema, RLS policies, RPCs
scripts/        UT catalog scraping, ingestion, and embedding (some scraping scripts are not included)
```

## Local development (reference)

Requires `pnpm`, a Supabase project, a Cloudflare account, a Google Gemini key, and a Stripe account.

1. Copy env: `cp .env.example .env.local` and fill in your own values (see comments in the file).
2. Install: `pnpm install`
3. Apply the database schema: run the migrations in `supabase/migrations/` against your Supabase
   project, then `pnpm gen:types`.
4. Populate the catalog with the `scripts/` (scrape → insert → embed). Course data is **not** in
   this repo — it lives in the database.
5. Chat Worker (`workers/chat/`): set its secrets and run it —
   ```bash
   cd workers/chat
   wrangler secret put SUPABASE_URL
   wrangler secret put SUPABASE_ANON_KEY
   wrangler secret put GOOGLE_GENERATIVE_AI_API_KEY
   pnpm dev      # or: pnpm deploy
   ```
6. App: `pnpm dev` (http://localhost:3000). For Stripe webhooks locally:
   `stripe listen --forward-to localhost:3000/api/stripe/webhook`.

## License

Source-available, all rights reserved — see [`LICENSE`](./LICENSE).

© 2026 Aiden Johnson.

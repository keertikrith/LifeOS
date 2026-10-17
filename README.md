# Life OS 🪔

Personal life-tracking for Indian life and Indian food. Log meals by chatting with a Telegram bot in English, हिन्दी, ಕನ್ನಡ or తెలుగు; see your days on a web dashboard (installable PWA).

**Stack:** Next.js 16 (App Router) · TypeScript strict · Supabase (Postgres, Auth, RLS) · Gemini (structured JSON) · Telegram webhook.

## Run it locally

```bash
npm install
npx supabase start -x studio,imgproxy,vector,logflare,edge-runtime,realtime,storage-api   # needs Docker
docker exec -i supabase_db_lifeOs psql -U postgres < supabase/seed.sql                      # 169 Indian foods
cp .env.example .env.local     # then fill in values (local Supabase keys: `npx supabase status -o env`)
npm run dev
```

Local email (magic links) shows up at http://127.0.0.1:54324.

### Environment (`.env.local`)
| Var | Notes |
|---|---|
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Model is only ever read from here (`gemini-2.5-flash` to start). Move to a paid tier or newer model by changing these two values. |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` | Create a bot with [@BotFather](https://t.me/BotFather) → `/newbot`. |
| `TELEGRAM_WEBHOOK_SECRET` | Any random string; Telegram echoes it as `X-Telegram-Bot-Api-Secret-Token`, which the route verifies. |
| `AUTO_CONFIRM_MINUTES` | Unconfirmed logs auto-save after this long (default 10). |

### Connect Telegram (local dev)
Telegram needs a public HTTPS URL. Start a tunnel, then register the webhook:
```bash
cloudflared tunnel --url http://localhost:3000      # or: ngrok http 3000
npm run webhook -- https://<your-tunnel-url>
```
Then: sign in on the site → **Get my link code** → open the bot and send `/start CODE`.

### Google sign-in (optional)
Magic-link email works out of the box. For Google: create an OAuth client in Google Cloud, add its ID/secret under `[auth.external.google]` in `supabase/config.toml` (local) or in the Supabase dashboard (cloud).

## Scripts
`npm test` unit tests · `npm run test:int` end-to-end bot flow against local Supabase (Gemini/Telegram stubbed) · `npm run seed:gen` rebuild `supabase/seed.sql` from `supabase/seed/foods.data.ts` · `npm run typecheck` · `npm run lint`

## Architecture
```
app/api/telegram → lib/telegram/service → lib/llm/parser (Gemini→zod) → lib/nutrition/matcher → lib/db/*
```
All business logic is in `lib/` so a future native app can reuse it behind the same API.

## Data notes
- `foods.source` is `curated_estimate` for the current seed (typical servings; **not** IFCT values). `ifct2017` rows will be added by a separate import and keep their own source tag.
- LLM estimates are stored with `match_type = 'estimated'` and always labelled in the bot and the UI.

## Before going multi-user (TODO — not built)
Privacy policy, data export & account deletion (DPDP Act) · paid LLM tier with suitable data terms · rate limiting on bot and ingest endpoints.

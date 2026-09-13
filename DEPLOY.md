# Deploying Market Edge to Vercel

## What you need
- GitHub account
- [Vercel](https://vercel.com) account (Hobby / free is fine)
- [Neon](https://neon.tech) free Postgres (recommended) — or Supabase

Local SQLite (`prisma/dev.db`) does **not** work on Vercel. Production uses Postgres.

## 1. Create a Postgres database (Neon)

1. Go to https://neon.tech and sign up / log in.
2. Create a project (e.g. `market-edge`).
3. Copy the **connection string** (URI). It looks like:
   `postgresql://user:password@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require`
4. Prefer the **pooled** connection string if Neon shows one (good for serverless).

## 2. Point this repo at Postgres and create tables

In your project folder:

```bash
cd /Users/goutham/portfolio-tracker
```

Update `.env` (keep a backup of the old SQLite URL if you want):

```env
DATABASE_URL="postgresql://…your-neon-url…"
CRON_SECRET="paste-a-long-random-secret"
```

Generate a secret, e.g.:

```bash
openssl rand -hex 32
```

Then create the first Postgres migration and apply it:

```bash
npx prisma migrate dev --name init_postgres
```

Optional seed (demo member):

```bash
npm run db:seed
```

## 3. Put the code on GitHub

If you have not committed yet:

```bash
cd /Users/goutham/portfolio-tracker
git add .
git status   # confirm .env is NOT listed
git commit -m "Initial Market Edge app ready for Vercel"
```

Create a GitHub repo (empty, no README), then:

```bash
git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
git branch -M main
git push -u origin main
```

## 4. Deploy on Vercel

1. https://vercel.com → **Add New…** → **Project** → import the GitHub repo.
2. Framework: Next.js (auto-detected).
3. Before deploying, open **Environment Variables** and add:

| Name | Value | Environments |
|------|--------|----------------|
| `DATABASE_URL` | Neon connection string | Production, Preview, Development |
| `CRON_SECRET` | same secret as local `.env` | Production (and Preview if you want) |
| `ANTHROPIC_API_KEY` | optional | Production |
| `QUOTE_CACHE_TTL_SECONDS` | `20` (optional) | Production |

4. Click **Deploy**.

The build runs `prisma migrate deploy` then `next build`, so tables are created on Postgres automatically.

## 5. Daily snapshots (already wired)

`vercel.json` schedules:

```json
{ "path": "/api/cron/snapshot", "schedule": "0 19 * * *" }
```

That is **19:00 UTC every day** (~12:30 AM IST next day / ~00:30 IST).  
Change the cron expression in `vercel.json` if you want a different time, then redeploy.

Vercel Hobby allows **daily** crons. With `CRON_SECRET` set, Vercel sends:

`Authorization: Bearer <CRON_SECRET>`

You can also trigger a snapshot manually from the app **Settings → Snapshot now** (that endpoint only requires the secret in production when called without auth — use Settings while logged into your own deploy, or call with the header).

Manual test after deploy:

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
  https://YOUR-APP.vercel.app/api/cron/snapshot
```

## 6. After it is live

1. Open `https://YOUR-APP.vercel.app`
2. Add people / accounts / trades (or re-import CSV).
3. Run **Snapshot now** once so charts have a starting point.
4. Next day, confirm a new row appeared (Settings snapshot or DB table `PortfolioValueSnapshot`).

## Local development after the switch

Use the **same Neon DB** or a separate Neon branch:

```env
DATABASE_URL="postgresql://…"
```

```bash
npm run dev
```

Do not commit `.env`.

## Troubleshooting

| Issue | Fix |
|--------|-----|
| Build fails on migrate | Check `DATABASE_URL` on Vercel; must be Postgres, not `file:./dev.db` |
| Cron 401 | `CRON_SECRET` on Vercel must match; no extra spaces |
| Cron never runs | Hobby plan: daily only; check Vercel → Project → Crons |
| Empty charts | Run snapshot once; performance chart also uses Yahoo history from trades |
| Yahoo errors on Vercel | Usually transient; quotes/history call Yahoo’s unofficial API |

## Security note

There is still **no login**. Anyone with the URL can edit data. For a private family tool, either keep the URL private or add a simple password later.

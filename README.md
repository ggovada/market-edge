# Market Edge — Personal Investment Portfolio Tracker

Multi-member portfolio desk for a single operator: FIFO tax lots (India STCG/LTCG), live Yahoo Finance quotes, P/L charts, and AI-narrated support/resistance levels.

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- Prisma + SQLite (swap `DATABASE_URL` to Postgres for production)
- `yahoo-finance2` behind a market-data adapter
- `lightweight-charts` + `recharts`
- Anthropic Claude (optional) for technical narratives
- PWA via `@ducanh2912/next-pwa`

## Quick start

```bash
npm install
npx prisma migrate dev --name init
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Optional env

```env
ANTHROPIC_API_KEY=sk-ant-...
CRON_SECRET=your-cron-secret
QUOTE_CACHE_TTL_SECONDS=20
```

## Features

1. **Members → Portfolios → Trades** with soft-delete + audit log  
2. **FIFO lots** and STCG/LTCG classification (configurable rates/exemption)  
3. **Per-member FY LTCG exemption** tracking (Apr–Mar)  
4. **Live quotes** with server-side TTL cache + stale fallback  
5. **CSV import** (`ticker,action,quantity,pricePerShare,fees,executedAt,notes`)  
6. **Value snapshots** via `/api/cron/snapshot` (Vercel Cron at 19:00 UTC)  
7. **Insights**: pivot/SMA/volume S&R + Claude narration  

Indian tickers need Yahoo suffixes (e.g. `RELIANCE.NS`, `TCS.NS`).

## Disclaimer

Informational tracking and estimation only — not tax, investment, or financial advice. Verify gains against broker capital-gains statements.

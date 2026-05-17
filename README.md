# Protected Analytics Reporting Layer Sandbox

This is a small Next.js App Router sandbox that demonstrates a protected reporting layer for article engagement analytics. It simulates Google Analytics API data, ingests it into Supabase Postgres tables, then answers dashboard requests through a SQL reporting function.

## Run It

```bash
npm install
supabase start
supabase db reset
copy .env.local.example .env.local
npm run dev
```

Update `.env.local` with the local `service_role` key from `supabase status`, then open `http://localhost:3000`.
The Supabase SQL seed file is intentionally empty; app data is imported through `/api/ingest`.

## Architecture

```text
Simulated GA API -> Supabase Postgres -> SQL reporting function -> API -> dashboard UI
```

## How The Pieces Fit

- `data/seed.json` acts like the GA API seed payload. `lib/ga-api.ts` expands it into a deterministic 120-day feed.
- `supabase/migrations/*_analytics_reporting.sql` creates `articles`, `ga_daily_engagement`, `ga_import_runs`, and `build_reporting_report(...)`.
- `lib/reporting.ts` is the protected reporting layer. It ingests simulated GA data into Supabase and asks Postgres for aggregated reporting JSON. Raw engagement records do not leave this layer.
- `app/api/reporting/route.ts` is the API boundary. It accepts `category`, `startDate`, `endDate`, and `groupBy`, then returns aggregated results only.
- `app/api/ingest/route.ts` lets you rerun the simulated GA import with `POST /api/ingest`.
- `app/page.tsx` is the dashboard. It calls the API, renders filters, draws a line chart, lists top articles, and shows a rolling-average forecast.

## API

Example request:

```text
/api/reporting?category=Fruit&startDate=2026-04-01&endDate=2026-04-30&groupBy=date
```

Supported query parameters:

- `category`: `All`, `Fruit`, `Vegetables`, `Herbs`, `Mushrooms`, `Roots`, or `Greens`
- `startDate`: date string like `2026-04-01`
- `endDate`: date string like `2026-04-30`
- `groupBy`: `date`, `source`, or `country`

The reporting API response includes:

- `totals`: total views, average engagement score, and article count
- `results`: grouped aggregate buckets
- `topArticles`: aggregate article rankings
- `forecast`: three future daily points based on a three-day rolling average
- `dataSource`: simulated GA import metadata and table row counts

To rerun the simulated import:

```bash
curl -X POST http://localhost:3000/api/ingest
```

## Why This Is "Protected"

In production, the reporting layer is where authentication, tenant permissions, and row-level data access checks would live. This sandbox keeps that shape simple:

1. Simulated GA records are fetched and expanded from `data/seed.json`.
2. The ingest layer stores normalized rows in Supabase tables.
3. `build_reporting_report(...)` filters and aggregates table rows according to the requested report.
4. The API route only returns aggregate output.
5. The dashboard never receives raw engagement rows.

That separation is the important pattern: dashboards consume prepared reporting results, not the original source event stream.

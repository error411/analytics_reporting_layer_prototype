# Protected Analytics Reporting Layer Sandbox

This is a small Next.js App Router sandbox demonstrating a protected reporting layer for article engagement analytics.

The app simulates Google Analytics data, ingests it into Supabase Postgres tables, and exposes only aggregated reporting results through a secure API boundary.

## What it shows

- a protected reporting layer that keeps raw event detail inside the data platform
- a SQL reporting function that returns bounded aggregates and metadata
- a dashboard UI that consumes only prepared reporting results
- an ingest endpoint that seeds the system from deterministic GA-like payloads

## Local setup

```bash
npm install
supabase start
supabase db reset
copy .env.local.example .env.local
npm run dev
```

Then open `http://localhost:3000`.

### Environment variables

Copy `.env.local.example` to `.env.local` and set the following values:

- `NEXT_PUBLIC_SUPABASE_URL`: local Supabase URL
- `SUPABASE_SERVICE_ROLE_KEY`: local Supabase service role key from `supabase status`
- `REPORTING_API_KEY`: a long, random admin key used by the ingest endpoint

The Supabase SQL migration is intentionally the only schema seed step; app data is imported through `/api/ingest`.

## Architecture

```text
Simulated GA API -> Supabase Postgres -> SQL reporting function -> API -> dashboard UI
```

## How the pieces fit

- `data/seed.json` acts as the simulated GA payload. `lib/ga-api.ts` expands 40 article pages into deterministic daily engagement from January 2020 through April 2026.
- `supabase/migrations/*_analytics_reporting.sql` creates `articles`, `ga_daily_engagement`, `ga_import_runs`, and `build_reporting_report(...)`.
- `lib/reporting.ts` is the protected reporting layer. It ingests the simulated GA data into Supabase and requests aggregated JSON from the database.
- `app/api/reporting/route.ts` is the API boundary. It accepts `category`, `startDate`, `endDate`, and `groupBy`, then returns bounded, aggregate-only results.
- `app/api/ingest/route.ts` replays the simulated GA import with `POST /api/ingest` when `x-reporting-api-key` is provided.
- `app/page.tsx` renders the dashboard, including filters, a line chart, top article rankings, and a rolling-average forecast.

## API

Example request:

```text
/api/reporting?category=Roots&startDate=2026-01-01&endDate=2026-04-30&groupBy=date
```

Supported query parameters:

- `category`: `All`, `Alliums`, `Brassicas`, `Fruit`, `Fruiting Vegetables`, `Greens`, `Herbs`, `Mushrooms`, `Roots`, `Squash`, or `Tubers`
- `startDate`: date string like `2020-01-01`
- `endDate`: date string like `2026-04-30`
- `groupBy`: `date`, `source`, or `country`

The reporting API response includes:

- `totals`: total views, average engagement score, and article count
- `results`: grouped aggregate buckets
- `topArticles`: aggregate article rankings
- `forecast`: three future daily points based on a three-day rolling average
- `dataSource`: simulated GA import metadata and table row counts

Reporting requests are restricted to same-origin, private/no-store semantics and capped to 370 days per request so clients cannot scrape the full history in one call. If dates are omitted, the API defaults to the most recent 370-day window.

To rerun the simulated import:

```bash
curl -X POST http://localhost:3000/api/ingest \
  -H "x-reporting-api-key: $REPORTING_API_KEY"
```

## Why this is protected

This sandbox models the important separation between raw source data and report-ready output:

1. raw GA-like records are expanded from `data/seed.json`
2. the ingest layer stores normalized rows in Supabase tables
3. `build_reporting_report(...)` filters and aggregates rows in the database
4. the API returns only bounded aggregate output and removes raw identifiers
5. the dashboard never receives raw engagement rows

The key pattern is that dashboards consume prepared reporting results instead of the original event stream.

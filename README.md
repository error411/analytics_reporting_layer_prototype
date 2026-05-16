# Protected Analytics Reporting Layer Sandbox

This is a small Next.js App Router sandbox that demonstrates a protected reporting layer for article engagement analytics. It simulates Google Analytics API data, ingests it into local database-style tables, then answers dashboard requests from those tables.

## Run It

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Architecture

```text
Simulated GA API -> local analytics database -> protected reporting layer -> API -> dashboard UI
```

## How The Pieces Fit

- `data/seed.json` acts like the GA API response payload. It contains articles and daily engagement records.
- `lib/ga-api.ts` simulates fetching from GA and maps the payload into database rows.
- `lib/database.ts` is a small in-process database abstraction with `articles` and `ga_daily_engagement` tables.
- `lib/reporting.ts` is the protected reporting layer. It ensures simulated GA data has been ingested, filters table rows, aggregates them, ranks articles, and creates a simple forecast. Raw engagement records do not leave this layer.
- `app/api/reporting/route.ts` is the API boundary. It accepts `category`, `startDate`, `endDate`, and `groupBy`, then returns aggregated results only.
- `app/api/ingest/route.ts` lets you rerun the simulated GA import with `POST /api/ingest`.
- `app/page.tsx` is the dashboard. It calls the API, renders filters, draws a line chart, lists top articles, and shows a rolling-average forecast.

## API

Example request:

```text
/api/reporting?category=Fruit&startDate=2026-04-01&endDate=2026-04-12&groupBy=date
```

Supported query parameters:

- `category`: `All`, `Fruit`, `Vegetables`, `Herbs`, or `Mushrooms`
- `startDate`: date string like `2026-04-01`
- `endDate`: date string like `2026-04-12`
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

1. Simulated GA records are fetched from `data/seed.json`.
2. The ingest layer stores normalized rows in `articles` and `ga_daily_engagement`.
3. `lib/reporting.ts` filters and aggregates table rows according to the requested report.
4. The API route only returns aggregate output.
5. The dashboard never receives raw engagement rows.

That separation is the important pattern: dashboards consume prepared reporting results, not the original source event stream.

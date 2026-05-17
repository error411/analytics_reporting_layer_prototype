"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { AggregatedPoint, ReportingResponse } from "@/lib/reporting";

const initialFilters = {
  category: "All",
  startDate: "2026-04-01",
  endDate: "2026-04-30",
  groupBy: "date"
};

type Filters = typeof initialFilters;

const datePresets = [
  {
    label: "7 day",
    startDate: "2026-04-24",
    endDate: "2026-04-30"
  },
  {
    label: "30 day",
    startDate: "2026-04-01",
    endDate: "2026-04-30"
  },
  {
    label: "90 day",
    startDate: "2026-01-31",
    endDate: "2026-04-30"
  },
  {
    label: "All time",
    startDate: "2024-05-01",
    endDate: "2026-04-30"
  }
];

export default function DashboardPage() {
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(initialFilters);
  const [report, setReport] = useState<ReportingResponse | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(appliedFilters);

    setIsLoading(true);
    setError("");

    fetch(`/api/reporting?${params.toString()}`)
      .then(async (response) => {
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error || "Unable to load reporting data.");
        }

        return payload as ReportingResponse;
      })
      .then(setReport)
      .catch((caughtError: Error) => setError(caughtError.message))
      .finally(() => setIsLoading(false));
  }, [appliedFilters]);

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAppliedFilters(filters);
  }

  return (
    <main className="page">
      <header className="masthead">
        <div className="masthead__inner">
          <p className="eyebrow">Protected reporting sandbox</p>
          <h1>Specialty produce article engagement</h1>
          <p className="lede">
            Simulated GA records are ingested into Supabase, then parsed through the reporting
            layer into filtered aggregate views.
          </p>
        </div>
      </header>

      <section className="dashboard" aria-label="Analytics dashboard">
        <form className="filters" onSubmit={submitFilters}>
          <div className="quick-range">
            <span>Quick range</span>
            <div className="preset-group" aria-label="Date presets">
              {datePresets.map((preset) => {
                const isActive =
                  filters.startDate === preset.startDate && filters.endDate === preset.endDate;

                return (
                  <button
                    className={isActive ? "preset preset--active" : "preset"}
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      const nextFilters = {
                        ...filters,
                        startDate: preset.startDate,
                        endDate: preset.endDate
                      };

                      setFilters(nextFilters);
                      setAppliedFilters(nextFilters);
                    }}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="field">
            <span>Category</span>
            <select
              value={filters.category}
              onChange={(event) => setFilters({ ...filters, category: event.target.value })}
            >
              <option value="All">All categories</option>
              {report?.categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Start date</span>
            <input
              type="date"
              value={filters.startDate}
              onChange={(event) => setFilters({ ...filters, startDate: event.target.value })}
            />
          </label>

          <label className="field">
            <span>End date</span>
            <input
              type="date"
              value={filters.endDate}
              onChange={(event) => setFilters({ ...filters, endDate: event.target.value })}
            />
          </label>

          <label className="field">
            <span>Group by</span>
            <select
              value={filters.groupBy}
              onChange={(event) => setFilters({ ...filters, groupBy: event.target.value })}
            >
              <option value="date">Date</option>
              <option value="source">Source</option>
              <option value="country">Country</option>
            </select>
          </label>

          <button className="button" type="submit">
            Apply
          </button>
        </form>

        {error ? <div className="error">{error}</div> : null}
        {isLoading ? <div className="empty">Loading aggregated report...</div> : null}

        {report && !isLoading ? (
          <>
            <section className="metrics" aria-label="Summary metrics">
              <div className="metric">
                <span>Total views</span>
                <strong>{formatNumber(report.totals.views)}</strong>
              </div>
              <div className="metric">
                <span>Avg engagement</span>
                <strong>{report.totals.averageEngagementScore}</strong>
              </div>
              <div className="metric">
                <span>Articles</span>
                <strong>{report.totals.articleCount}</strong>
              </div>
            </section>

            <section className="pipeline" aria-label="Data pipeline status">
              <div>
                <span>Source import</span>
                <strong>{report.dataSource.source}</strong>
              </div>
              <div>
                <span>Database tables</span>
                <strong>
                  articles ({report.dataSource.tables.articles}) / ga_daily_engagement (
                  {report.dataSource.tables.gaDailyEngagement})
                </strong>
              </div>
              <div>
                <span>Imported at</span>
                <strong>{formatDateTime(report.dataSource.importedAt)}</strong>
              </div>
            </section>

            <section className="grid">
              <div className="panel panel--chart">
                <h2>{chartTitle(report.filters.groupBy)}</h2>
                <HorizontalReportChart points={report.results} groupBy={report.filters.groupBy} />
              </div>

              <div className="table-wrap">
                <h2>Top articles</h2>
                <TopArticlesTable report={report} />
              </div>
            </section>
          </>
        ) : null}
      </section>
    </main>
  );
}

function HorizontalReportChart({ points, groupBy }: { points: AggregatedPoint[]; groupBy: string }) {
  const chartPoints = useMemo(() => prepareChartPoints(points, groupBy), [points, groupBy]);
  const maxViews = Math.max(...chartPoints.map((point) => point.views), 1);
  const xTicks = buildTicks(maxViews);

  if (chartPoints.length === 0) {
    return <div className="empty">No aggregate data matches these filters.</div>;
  }

  return (
    <div className="report-chart">
      <div className="chart-legend" aria-label="Chart legend">
        <span>
          <i className="legend-box legend-box--engagement" />
          Engagement
        </span>
        <span>
          <i className="legend-box legend-box--views" />
          Views
        </span>
      </div>

      <div className="bar-grid">
        {chartPoints.map((point) => (
          <div className="bar-row" key={point.label}>
            <div className="bar-label">{point.label}</div>
            <div className="bar-track">
              <div className="bar-line">
                <span
                  className="bar bar--engagement"
                  style={{ width: `${point.averageEngagementScore}%` }}
                />
                <b style={{ left: `${point.averageEngagementScore}%` }}>
                  {point.averageEngagementScore}
                </b>
              </div>
              <div className="bar-line">
                <span
                  className="bar bar--views"
                  style={{ width: `${(point.views / maxViews) * 100}%` }}
                />
                <b style={{ left: `${(point.views / maxViews) * 100}%` }}>
                  {formatNumber(point.views)}
                </b>
              </div>
            </div>
          </div>
        ))}

        <div className="axis-row" aria-hidden="true">
          {xTicks.map((tick, index) => (
            <span key={tick} style={{ gridColumn: index + 2 }}>
              {formatCompact(tick)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function TopArticlesTable({ report }: { report: ReportingResponse }) {
  if (report.topArticles.length === 0) {
    return <div className="empty">No articles found for this filter set.</div>;
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Article</th>
          <th>Category</th>
          <th>Views</th>
        </tr>
      </thead>
      <tbody>
        {report.topArticles.map((article) => (
          <tr key={article.articleId}>
            <td>{article.title}</td>
            <td>{article.category}</td>
            <td>{formatNumber(article.views)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function prepareChartPoints(points: AggregatedPoint[], groupBy: string): AggregatedPoint[] {
  if (groupBy !== "date") {
    return [...points].sort((a, b) => b.views - a.views);
  }

  const buckets = new Map<string, AggregatedPoint[]>();

  for (const point of points) {
    const monthKey = point.label.slice(0, 7);
    const bucket = buckets.get(monthKey) || [];
    bucket.push(point);
    buckets.set(monthKey, bucket);
  }

  return [...buckets.entries()].map(([monthKey, bucket]) => {
    const recordCount = bucket.reduce((sum, point) => sum + point.recordCount, 0);
    const weightedEngagement = bucket.reduce(
      (sum, point) => sum + point.averageEngagementScore * point.recordCount,
      0
    );

    return {
      label: formatMonth(monthKey),
      views: bucket.reduce((sum, point) => sum + point.views, 0),
      averageEngagementScore: Math.round((weightedEngagement / Math.max(recordCount, 1)) * 10) / 10,
      recordCount
    };
  });
}

function buildTicks(maxValue: number) {
  const step = niceStep(maxValue / 6);
  return Array.from({ length: 7 }, (_, index) => index * step);
}

function niceStep(value: number) {
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(value, 1)));
  const normalized = value / magnitude;

  if (normalized <= 1) return magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

function chartTitle(groupBy: string) {
  if (groupBy === "date") return "Monthly engagement";
  if (groupBy === "country") return "Engagement by country";
  return "Engagement by source";
}

function formatMonth(value: string) {
  const [year, month] = value.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric"
  }).format(date);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatCompact(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);
}

function formatDateTime(value: string) {
  if (!value) return "Pending";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

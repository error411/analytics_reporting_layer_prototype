"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { AggregatedPoint, ForecastPoint, ReportingResponse } from "@/lib/reporting";

const initialFilters = {
  category: "All",
  startDate: "2026-04-01",
  endDate: "2026-04-12",
  groupBy: "date"
};

type Filters = typeof initialFilters;

const datePresets = [
  {
    label: "7 day",
    // The mock dataset currently ends on 2026-04-12, so presets are anchored
    // to the latest available seed date instead of the real current date.
    startDate: "2026-04-06",
    endDate: "2026-04-12"
  },
  {
    label: "30 day",
    startDate: "2026-03-14",
    endDate: "2026-04-12"
  },
  {
    label: "90 day",
    startDate: "2026-01-13",
    endDate: "2026-04-12"
  },
  {
    label: "All time",
    startDate: "2026-04-01",
    endDate: "2026-04-12"
  }
];

export default function DashboardPage() {
  const [filters, setFilters] = useState<Filters>(initialFilters);
  // Keep draft form edits separate from the query currently driving the report.
  const [appliedFilters, setAppliedFilters] = useState<Filters>(initialFilters);
  const [report, setReport] = useState<ReportingResponse | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(appliedFilters);

    // Treat each filter application as a fresh report request.
    setIsLoading(true);
    setError("");

    fetch(`/api/reporting?${params.toString()}`)
      .then((response) => {
        if (!response.ok) throw new Error("Unable to load reporting data.");
        return response.json() as Promise<ReportingResponse>;
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
            Mock source records stay behind the reporting layer. The dashboard only receives
            aggregated views, scores, rankings, and a rolling-average forecast.
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
                      // Presets are direct actions, so apply them immediately.
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
              <div className="panel">
                <h2>Engagement over time</h2>
                <EngagementChart
                  points={report.results}
                  forecast={report.forecast}
                  groupBy={report.filters.groupBy}
                />
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

function EngagementChart({
  points,
  forecast,
  groupBy
}: {
  points: AggregatedPoint[];
  forecast: ForecastPoint[];
  groupBy: string;
}) {
  // Memoize the geometry so table/filter state updates do not recompute chart paths.
  const chart = useMemo(() => buildChart(points, forecast), [points, forecast]);

  if (points.length === 0) {
    return <div className="empty">No aggregate data matches these filters.</div>;
  }

  // Forecasts are most meaningful when the API is grouped by date.
  const showForecast = groupBy === "date" && forecast.length > 0;

  return (
    <>
      <svg className="chart" viewBox="0 0 760 330" role="img" aria-label="Views chart">
        <line className="axis" x1="56" x2="730" y1="280" y2="280" />
        <line className="axis" x2="56" x1="56" y1="24" y2="280" />

        {chart.yTicks.map((tick) => (
          <g key={tick.value}>
            <line className="tick" x1="52" x2="730" y1={tick.y} y2={tick.y} />
            <text className="chart-label" x="12" y={tick.y + 4}>
              {formatCompact(tick.value)}
            </text>
          </g>
        ))}

        <polyline className="line" points={chart.actualPath} />
        {showForecast ? <polyline className="forecast-line" points={chart.forecastPath} /> : null}

        {chart.actualPoints.map((point) => (
          <circle className="point" key={point.label} cx={point.x} cy={point.y} r="4" />
        ))}
        {showForecast
          ? chart.forecastPoints.map((point) => (
              <circle
                className="forecast-point"
                key={point.label}
                cx={point.x}
                cy={point.y}
                r="4"
              />
            ))
          : null}

        {chart.axisLabels.map((label) => (
          <text className="chart-label" key={label.text} x={label.x} y="310" textAnchor="middle">
            {label.text}
          </text>
        ))}
      </svg>
      <div className="legend">
        <span>Actual aggregate views</span>
        {showForecast ? <span>Three-day rolling average forecast</span> : null}
      </div>
    </>
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

function buildChart(points: AggregatedPoint[], forecast: ForecastPoint[]) {
  // Translate report buckets into SVG coordinates for the fixed chart viewBox.
  const width = 760;
  const height = 330;
  const padding = { top: 24, right: 30, bottom: 50, left: 56 };
  const allValues = [
    ...points.map((point) => point.views),
    ...forecast.map((point) => point.forecastViews)
  ];
  const maxValue = Math.max(...allValues, 1);
  const yMax = Math.ceil(maxValue / 500) * 500;

  const actualLabels = points.map((point) => point.label);
  const forecastLabels = forecast.map((point) => point.date);
  const labels = [...actualLabels, ...forecastLabels];

  const xForIndex = (index: number) => {
    if (labels.length === 1) return width / 2;
    return padding.left + (index / (labels.length - 1)) * (width - padding.left - padding.right);
  };

  const yForValue = (value: number) => {
    const chartHeight = height - padding.top - padding.bottom;
    return padding.top + (1 - value / yMax) * chartHeight;
  };

  const actualPoints = points.map((point, index) => ({
    label: point.label,
    x: xForIndex(index),
    y: yForValue(point.views)
  }));

  const forecastPoints = forecast.map((point, index) => ({
    label: point.date,
    x: xForIndex(points.length + index),
    y: yForValue(point.forecastViews)
  }));

  const yTicks = [0, yMax / 2, yMax].map((value) => ({
    value,
    y: yForValue(value)
  }));

  // Keep axis labels sparse so small screens remain readable.
  const axisLabels = labels
    .filter((_, index) => index === 0 || index === labels.length - 1 || index % 4 === 0)
    .map((text) => ({
      text,
      x: xForIndex(labels.indexOf(text))
    }));

  return {
    actualPoints,
    forecastPoints,
    actualPath: toPolyline(actualPoints),
    forecastPath: toPolyline([...actualPoints.slice(-1), ...forecastPoints]),
    yTicks,
    axisLabels
  };
}

function toPolyline(points: { x: number; y: number }[]) {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
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

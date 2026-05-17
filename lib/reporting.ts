import {
  getImportMetadata,
  hasAnalyticsData,
  selectArticles,
  selectGaDailyEngagement,
  upsertAnalyticsSnapshot,
  type Article,
  type GaDailyEngagementRow
} from "@/lib/database";
import { fetchSimulatedGaApiData, mapGaPayloadToRows } from "@/lib/ga-api";

export type GroupBy = "date" | "source" | "country";

export type ReportingQuery = {
  category?: string;
  startDate?: string;
  endDate?: string;
  groupBy: GroupBy;
};

export type AggregatedPoint = {
  label: string;
  views: number;
  averageEngagementScore: number;
  recordCount: number;
};

export type TopArticle = {
  articleId: string;
  title: string;
  category: string;
  slug: string;
  views: number;
  averageEngagementScore: number;
};

export type ForecastPoint = {
  date: string;
  forecastViews: number;
};

export type ReportingResponse = {
  filters: {
    category: string;
    startDate: string;
    endDate: string;
    groupBy: GroupBy;
  };
  categories: string[];
  totals: {
    views: number;
    averageEngagementScore: number;
    articleCount: number;
  };
  results: AggregatedPoint[];
  topArticles: TopArticle[];
  forecast: ForecastPoint[];
  dataSource: {
    source: "simulated-ga-api";
    importedAt: string;
    tables: {
      articles: number;
      gaDailyEngagement: number;
    };
  };
};

const allowedGroupBy: GroupBy[] = ["date", "source", "country"];

export function ingestSimulatedGaData() {
  const payload = fetchSimulatedGaApiData();
  const rows = mapGaPayloadToRows(payload);
  upsertAnalyticsSnapshot(rows);
  return getImportMetadata();
}

function ensureAnalyticsData() {
  if (!hasAnalyticsData()) {
    ingestSimulatedGaData();
  }
}

export function getCategories() {
  ensureAnalyticsData();
  const articles = selectArticles();
  return [...new Set(articles.map((article) => article.category))].sort();
}

export function normalizeQuery(query: ReportingQuery) {
  ensureAnalyticsData();
  const engagement = selectGaDailyEngagement();
  const category = query.category || "All";
  const groupBy = allowedGroupBy.includes(query.groupBy) ? query.groupBy : "date";

  // The seed data is small, so deriving default dates from it keeps the demo portable.
  const sortedDates = [...new Set(engagement.map((record) => record.date))].sort();
  const startDate = query.startDate || sortedDates[0];
  const endDate = query.endDate || sortedDates[sortedDates.length - 1];

  return { category, startDate, endDate, groupBy };
}

export function buildReport(query: ReportingQuery): ReportingResponse {
  ensureAnalyticsData();

  const filters = normalizeQuery(query);
  const articles = selectArticles();
  const engagement = selectGaDailyEngagement();
  const articleById = new Map(articles.map((article) => [article.id, article]));
  const importMetadata = getImportMetadata();

  // This is the "protected reporting layer": raw engagement rows are filtered here,
  // after the GA import has landed in database tables. Only aggregate values leave
  // this module through the API response.
  const filteredRecords = engagement.filter((record) => {
    const article = articleById.get(record.articleId);

    if (!article) return false;
    if (filters.category !== "All" && article.category !== filters.category) return false;
    if (record.date < filters.startDate || record.date > filters.endDate) return false;

    return true;
  });

  const results = aggregateRecords(filteredRecords, filters.groupBy);
  const topArticles = buildTopArticles(filteredRecords, articleById);
  const totalViews = filteredRecords.reduce((sum, record) => sum + record.views, 0);

  return {
    filters,
    categories: getCategories(),
    totals: {
      views: totalViews,
      averageEngagementScore: average(filteredRecords.map((record) => record.engagementScore)),
      articleCount: new Set(filteredRecords.map((record) => record.articleId)).size
    },
    results,
    topArticles,
    forecast: buildForecast(filteredRecords),
    dataSource: {
      source: importMetadata?.source || "simulated-ga-api",
      importedAt: importMetadata?.importedAt || "",
      tables: {
        articles: importMetadata?.articleRows || articles.length,
        gaDailyEngagement: importMetadata?.engagementRows || engagement.length
      }
    }
  };
}

function aggregateRecords(records: GaDailyEngagementRow[], groupBy: GroupBy) {
  const buckets = new Map<string, GaDailyEngagementRow[]>();

  for (const record of records) {
    const key = record[groupBy];
    const bucket = buckets.get(key) || [];
    bucket.push(record);
    buckets.set(key, bucket);
  }

  return [...buckets.entries()]
    .map(([label, bucket]) => ({
      label,
      views: bucket.reduce((sum, record) => sum + record.views, 0),
      averageEngagementScore: average(bucket.map((record) => record.engagementScore)),
      recordCount: bucket.length
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function buildTopArticles(
  records: GaDailyEngagementRow[],
  articleById: Map<string, Article>
): TopArticle[] {
  const buckets = new Map<string, GaDailyEngagementRow[]>();

  for (const record of records) {
    const bucket = buckets.get(record.articleId) || [];
    bucket.push(record);
    buckets.set(record.articleId, bucket);
  }

  return [...buckets.entries()]
    .map(([articleId, bucket]) => {
      const article = articleById.get(articleId);

      return {
        articleId,
        title: article?.title || "Unknown article",
        category: article?.category || "Unknown",
        slug: article?.slug || "",
        views: bucket.reduce((sum, record) => sum + record.views, 0),
        averageEngagementScore: average(bucket.map((record) => record.engagementScore))
      };
    })
    .sort((a, b) => b.views - a.views)
    .slice(0, 5);
}

function buildForecast(records: GaDailyEngagementRow[]): ForecastPoint[] {
  const dailyViews = aggregateRecords(records, "date");
  const lastThreeDays = dailyViews.slice(-3);
  const rollingAverage = Math.round(average(lastThreeDays.map((point) => point.views)));
  const finalDate = dailyViews.at(-1)?.label;

  if (!finalDate || rollingAverage === 0) return [];

  // A simple teaching forecast: take the last three actual days, average them,
  // then extend the line three days forward with that expected daily view count.
  return [1, 2, 3].map((offset) => ({
    date: addDays(finalDate, offset),
    forecastViews: rollingAverage
  }));
}

function average(values: number[]) {
  if (values.length === 0) return 0;

  const total = values.reduce((sum, value) => sum + value, 0);
  return Math.round((total / values.length) * 10) / 10;
}

function addDays(date: string, offset: number) {
  const nextDate = new Date(`${date}T00:00:00`);
  nextDate.setDate(nextDate.getDate() + offset);
  return nextDate.toISOString().slice(0, 10);
}

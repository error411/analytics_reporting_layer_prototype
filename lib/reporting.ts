import {
  type Article,
  type GaDailyEngagementRow
} from "@/lib/database";
import { fetchSimulatedGaApiData, mapGaPayloadToRows } from "@/lib/ga-api";
import { supabaseRequest } from "@/lib/supabase-rest";

export type GroupBy = "date" | "source" | "country";

export type ReportingQuery = {
  articleId?: string;
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
  title: string;
  category: string;
  views: number;
  averageEngagementScore: number;
};

export type ForecastPoint = {
  date: string;
  forecastViews: number;
};

export type ReportingResponse = {
  filters: {
    articleId?: string;
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
const engagementInsertBatchSize = 1000;
const maxReportRangeDays = 370;
const maxResultBuckets = 400;
const maxTopArticles = 5;

type SupabaseArticleRow = {
  id: string;
  title: string;
  category: string;
  slug: string;
};

type SupabaseEngagementRow = {
  id: string;
  article_id: string;
  date: string;
  views: number;
  engagement_score: number;
  country: string;
  source: string;
  imported_at: string;
};

type ImportRunRow = {
  source: "simulated-ga-api";
  imported_at: string;
  article_rows: number;
  engagement_rows: number;
};

export async function ingestSimulatedGaData() {
  const payload = fetchSimulatedGaApiData();
  const rows = mapGaPayloadToRows(payload);

  await supabaseRequest<SupabaseArticleRow[]>("articles", {
    method: "POST",
    query: { on_conflict: "id" },
    body: rows.articles.map(toArticleRow),
    prefer: "resolution=merge-duplicates"
  });

  // The generated history is intentionally broad, so insert engagement in REST-sized chunks.
  for (const batch of chunk(rows.engagement.map(toEngagementRow), engagementInsertBatchSize)) {
    await supabaseRequest<SupabaseEngagementRow[]>("ga_daily_engagement", {
      method: "POST",
      query: { on_conflict: "article_id,date,country,source" },
      body: batch,
      prefer: "resolution=merge-duplicates"
    });
  }

  const [importRun] = await supabaseRequest<ImportRunRow[]>("ga_import_runs", {
    method: "POST",
    body: {
      source: "simulated-ga-api",
      imported_at: rows.engagement[0]?.importedAt || new Date().toISOString(),
      article_rows: rows.articles.length,
      engagement_rows: rows.engagement.length
    },
    prefer: "return=representation"
  });

  return {
    source: importRun.source,
    importedAt: importRun.imported_at,
    articleRows: importRun.article_rows,
    engagementRows: importRun.engagement_rows
  };
}

export function normalizeQuery(query: ReportingQuery) {
  const articleId = query.articleId || undefined;
  const category = query.category || "All";
  const groupBy = allowedGroupBy.includes(query.groupBy) ? query.groupBy : "date";
  const endDate = query.endDate || todayString();
  const startDate = query.startDate || daysBefore(endDate, maxReportRangeDays - 1);

  validateDateRange(startDate, endDate);

  return { articleId, category, startDate, endDate, groupBy };
}

export async function buildReport(query: ReportingQuery): Promise<ReportingResponse> {
  const filters = normalizeQuery(query);

  // The first report request behaves like a scheduled ETL job in miniature:
  // if no imported GA rows exist yet, pull the simulated feed into Supabase.
  const existingRows = await supabaseRequest<Array<{ id: string }>>("ga_daily_engagement", {
    query: { select: "id", limit: "1" }
  });

  if (existingRows.length === 0) {
    await ingestSimulatedGaData();
  }

  const body: {
    p_category: string;
    p_start_date: string | null;
    p_end_date: string | null;
    p_group_by: GroupBy;
    p_article_id?: string;
  } = {
    p_category: filters.category,
    p_start_date: filters.startDate || null,
    p_end_date: filters.endDate || null,
    p_group_by: filters.groupBy
  };

  if (filters.articleId) {
    body.p_article_id = filters.articleId;
  }

  const report = await supabaseRequest<ReportingResponse>("rpc/build_reporting_report", {
    method: "POST",
    body
  });

  return sanitizeReport(report);
}

function toArticleRow(article: Article): SupabaseArticleRow {
  return article;
}

function toEngagementRow(record: GaDailyEngagementRow): SupabaseEngagementRow {
  return {
    id: record.id,
    article_id: record.articleId,
    date: record.date,
    views: record.views,
    engagement_score: record.engagementScore,
    country: record.country,
    source: record.source,
    imported_at: record.importedAt
  };
}

function chunk<T>(items: T[], size: number) {
  const batches: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }

  return batches;
}

function validateDateRange(startDate?: string, endDate?: string) {
  if (!startDate || !endDate) {
    return;
  }

  const start = parseDate(startDate, "startDate");
  const end = parseDate(endDate, "endDate");

  if (start > end) {
    throw new Error("startDate must be before or equal to endDate.");
  }

  const rangeDays = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;

  if (rangeDays > maxReportRangeDays) {
    throw new Error(`Reporting range is limited to ${maxReportRangeDays} days per request.`);
  }
}

function parseDate(value: string, label: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must use YYYY-MM-DD format.`);
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label} must be a valid date.`);
  }

  return date;
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function daysBefore(value: string, days: number) {
  const date = parseDate(value, "endDate");
  date.setUTCDate(date.getUTCDate() - days);

  return date.toISOString().slice(0, 10);
}

function sanitizeReport(report: ReportingResponse): ReportingResponse {
  return {
    ...report,
    results: report.results.slice(0, maxResultBuckets),
    topArticles: report.topArticles.slice(0, maxTopArticles).map((article) => ({
      title: article.title,
      category: article.category,
      views: article.views,
      averageEngagementScore: article.averageEngagementScore
    }))
  };
}

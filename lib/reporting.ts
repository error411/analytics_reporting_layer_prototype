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

  await supabaseRequest<SupabaseEngagementRow[]>("ga_daily_engagement", {
    method: "POST",
    query: { on_conflict: "article_id,date,country,source" },
    body: rows.engagement.map(toEngagementRow),
    prefer: "resolution=merge-duplicates"
  });

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
  const startDate = query.startDate || undefined;
  const endDate = query.endDate || undefined;

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

  return supabaseRequest<ReportingResponse>("rpc/build_reporting_report", {
    method: "POST",
    body
  });
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

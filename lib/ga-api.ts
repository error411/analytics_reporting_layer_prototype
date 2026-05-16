import seed from "@/data/seed.json";
import type { Article, GaDailyEngagementRow } from "@/lib/database";

type GaArticlePayload = Article;

type GaMetricPayload = {
  articleId: string;
  date: string;
  views: number;
  engagementScore: number;
  country: string;
  source: string;
};

export type GaApiPayload = {
  articles: GaArticlePayload[];
  engagement: GaMetricPayload[];
};

export function fetchSimulatedGaApiData(): GaApiPayload {
  return {
    articles: seed.articles as GaArticlePayload[],
    engagement: seed.engagement as GaMetricPayload[]
  };
}

export function mapGaPayloadToRows(payload: GaApiPayload): {
  articles: Article[];
  engagement: GaDailyEngagementRow[];
} {
  const importedAt = "2026-04-13T08:00:00.000Z";

  return {
    articles: payload.articles.map((article) => ({
      ...article
    })),
    engagement: payload.engagement.map((record, index) => ({
      id: `ga-row-${String(index + 1).padStart(4, "0")}`,
      articleId: record.articleId,
      date: record.date,
      views: record.views,
      engagementScore: record.engagementScore,
      country: record.country,
      source: record.source,
      importedAt
    }))
  };
}

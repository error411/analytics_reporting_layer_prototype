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

const countries = [
  "United States",
  "Canada",
  "Mexico",
  "China",
  "United Kingdom",
  "France",
  "India",
  "Vietnam",
  "Philippines",
  "Denmark",
  "Poland",
  "Portugal",
  "Egypt",
  "Saudi Arabia",
  "Colombia",
  "Costa Rica"
];
const sources = ["organic", "newsletter", "social", "direct", "referral", "paid"];
const baseDate = "2020-01-01";
const endDate = "2026-04-30";
const dayCount = daysBetween(baseDate, endDate) + 1;

export function fetchSimulatedGaApiData(): GaApiPayload {
  const articles = seed.articles as GaArticlePayload[];

  return {
    articles,
    engagement: generateEngagement(articles)
  };
}

export function mapGaPayloadToRows(payload: GaApiPayload): {
  articles: Article[];
  engagement: GaDailyEngagementRow[];
} {
  const importedAt = "2026-05-01T08:00:00.000Z";

  return {
    articles: payload.articles.map((article) => ({
      ...article
    })),
    engagement: payload.engagement.map((record) => ({
      id: [
        "ga",
        record.articleId,
        record.date,
        slugify(record.country),
        slugify(record.source)
      ].join("-"),
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

function generateEngagement(articles: GaArticlePayload[]) {
  const seededEngagement = seed.engagement as GaMetricPayload[];
  const rows: GaMetricPayload[] = [...seededEngagement];
  const existingKeys = new Set(
    rows.map((record) => `${record.articleId}:${record.date}:${record.country}:${record.source}`)
  );

  for (let dayIndex = 0; dayIndex < dayCount; dayIndex += 1) {
    const date = addDays(baseDate, dayIndex);

    articles.forEach((article, articleIndex) => {
      const country = countries[(dayIndex + articleIndex) % countries.length];
      const source = sources[(dayIndex * 2 + articleIndex) % sources.length];
      const key = `${article.id}:${date}:${country}:${source}`;

      if (existingKeys.has(key)) return;

      rows.push({
        articleId: article.id,
        date,
        views: viewsFor(dayIndex, articleIndex),
        engagementScore: engagementScoreFor(dayIndex, articleIndex),
        country,
        source
      });
    });
  }

  return rows.sort((a, b) =>
    a.date === b.date ? a.articleId.localeCompare(b.articleId) : a.date.localeCompare(b.date)
  );
}

function viewsFor(dayIndex: number, articleIndex: number) {
  const base = 2 + (articleIndex % 12) * 0.8 + Math.floor(articleIndex / 12) * 1.4;
  const trend = dayIndex > 365 ? (dayIndex - 365) * 0.008 * ((articleIndex % 10) + 1) : 0;
  const weeklyPulse = [0, 1, 0, 1, 2, 3, 2][dayIndex % 7];
  const seasonalLift = seasonalDemand(dayIndex, articleIndex);
  const campaignLift = dayIndex > dayCount - 80 && dayIndex < dayCount - 40 ? 4 + articleIndex * 0.15 : 0;

  return Math.round(base + trend + weeklyPulse + seasonalLift + campaignLift);
}

function engagementScoreFor(dayIndex: number, articleIndex: number) {
  const score = 54 + (articleIndex % 14) * 2.2 + (dayIndex % 10) * 1.1 + (dayIndex > 70 ? 4 : 0);
  return Math.min(96, Math.round(score * 10) / 10);
}

function seasonalDemand(dayIndex: number, articleIndex: number) {
  const month = new Date(`${addDays(baseDate, dayIndex)}T00:00:00`).getMonth();
  const warmSeason = month >= 4 && month <= 8 ? 2.5 : 0;
  const coolSeason = month <= 2 || month >= 9 ? 2.2 : 0;

  if (articleIndex <= 13) return coolSeason;
  if (articleIndex >= 31) return warmSeason;
  return month % 3 === articleIndex % 3 ? 1.6 : 0;
}

function addDays(date: string, offset: number) {
  const nextDate = new Date(`${date}T00:00:00`);
  nextDate.setDate(nextDate.getDate() + offset);
  return nextDate.toISOString().slice(0, 10);
}

function daysBetween(start: string, end: string) {
  const startTime = new Date(`${start}T00:00:00`).getTime();
  const endTime = new Date(`${end}T00:00:00`).getTime();
  return Math.round((endTime - startTime) / 86_400_000);
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

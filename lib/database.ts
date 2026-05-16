export type Article = {
  id: string;
  title: string;
  category: string;
  slug: string;
};

export type GaDailyEngagementRow = {
  id: string;
  articleId: string;
  date: string;
  views: number;
  engagementScore: number;
  country: string;
  source: string;
  importedAt: string;
};

type AnalyticsDatabase = {
  articles: Article[];
  gaDailyEngagement: GaDailyEngagementRow[];
  lastImport: {
    source: "simulated-ga-api";
    importedAt: string;
    articleRows: number;
    engagementRows: number;
  } | null;
};

const database: AnalyticsDatabase = {
  articles: [],
  gaDailyEngagement: [],
  lastImport: null
};

export function upsertAnalyticsSnapshot({
  articles,
  engagement
}: {
  articles: Article[];
  engagement: GaDailyEngagementRow[];
}) {
  database.articles = [...articles];
  database.gaDailyEngagement = [...engagement];
  database.lastImport = {
    source: "simulated-ga-api",
    importedAt: engagement[0]?.importedAt || new Date().toISOString(),
    articleRows: articles.length,
    engagementRows: engagement.length
  };
}

export function selectArticles() {
  return [...database.articles];
}

export function selectGaDailyEngagement() {
  return [...database.gaDailyEngagement];
}

export function getImportMetadata() {
  return database.lastImport;
}

export function hasAnalyticsData() {
  return database.articles.length > 0 && database.gaDailyEngagement.length > 0;
}

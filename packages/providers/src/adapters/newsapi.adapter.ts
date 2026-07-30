import type { NewsSentimentData, NewsSentimentProviderAdapter } from '../types.js';
import { naiveSentimentFromHeadlines } from '../sentiment-lexicon.js';

interface NewsApiResponse {
  totalResults: number;
  articles: Array<{ title: string }>;
}

/**
 * Optional keyed provider — `isAvailable()` is false unless NEWS_API_KEY is
 * set, so the registry silently skips it and falls through to the
 * Fear & Greed-only sentiment path. Never required to boot the API.
 */
export class NewsApiSentimentAdapter implements NewsSentimentProviderAdapter {
  readonly name = 'newsapi';

  constructor(private readonly apiKey: string | undefined) {}

  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  async execute({ query }: { query: string }): Promise<NewsSentimentData> {
    if (!this.apiKey) throw new Error('newsapi: no API key configured');

    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&pageSize=20&sortBy=publishedAt&language=en`;
    const res = await fetch(url, { headers: { 'X-Api-Key': this.apiKey } });
    if (!res.ok) throw new Error(`newsapi: HTTP ${res.status}`);
    const data = (await res.json()) as NewsApiResponse;

    return {
      articleCount: data.totalResults,
      sentiment: naiveSentimentFromHeadlines(data.articles.map((article) => article.title)),
    };
  }
}

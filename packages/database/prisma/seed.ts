import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PROVIDERS = [
  { name: 'coingecko', capability: 'market-data', isKeyless: true },
  { name: 'binance', capability: 'market-data', isKeyless: true },
  { name: 'alternative-me', capability: 'sentiment', isKeyless: true },
  { name: 'defillama', capability: 'market-data', isKeyless: true },
  { name: 'newsapi', capability: 'sentiment', isKeyless: false },
];

const MARKETPLACE_APIS = [
  {
    slug: 'analyze',
    name: 'Analyze',
    description: 'Flagship decision-intelligence endpoint: action, confidence, risk, and the reasoning behind them.',
    category: 'Financial Intelligence',
    priceUsd: 0.05,
    endpoint: '/v1/analyze',
    status: 'live',
  },
  {
    slug: 'market-summary',
    name: 'Market Summary',
    description: 'Normalized price, volume, and liquidity snapshot for an asset.',
    category: 'Financial Intelligence',
    priceUsd: 0.02,
    endpoint: '/v1/market-summary',
    status: 'live',
  },
  {
    slug: 'sentiment',
    name: 'Sentiment',
    description: 'Fear & Greed index plus optional news sentiment, normalized into one score.',
    category: 'Financial Intelligence',
    priceUsd: 0.02,
    endpoint: '/v1/sentiment',
    status: 'live',
  },
  {
    slug: 'risk-analysis',
    name: 'Risk Analysis',
    description: 'Volatility, liquidity, and drawdown risk scoring for an asset.',
    category: 'Financial Intelligence',
    priceUsd: 0.03,
    endpoint: '/v1/risk-analysis',
    status: 'live',
  },
  {
    slug: 'technical-summary',
    name: 'Technical Summary',
    description: 'Trend direction and momentum summary.',
    category: 'Financial Intelligence',
    priceUsd: 0.03,
    endpoint: '/v1/technical-summary',
    status: 'beta',
  },
  {
    slug: 'trending-assets',
    name: 'Trending Assets',
    description: 'Ranked list of currently trending assets.',
    category: 'Financial Intelligence',
    priceUsd: 0.02,
    endpoint: '/v1/trending-assets',
    status: 'live',
  },
  {
    slug: 'portfolio-health',
    name: 'Portfolio Health',
    description: 'Diversification and risk scoring for a set of holdings.',
    category: 'Financial Intelligence',
    priceUsd: 0.04,
    endpoint: '/v1/portfolio-health',
    status: 'beta',
  },
  {
    slug: 'execution-readiness',
    name: 'Execution Readiness',
    description: 'Whether current liquidity/volatility conditions favor executing a trade now.',
    category: 'Financial Intelligence',
    priceUsd: 0.03,
    endpoint: '/v1/execution-readiness',
    status: 'beta',
  },
];

async function main() {
  for (const provider of PROVIDERS) {
    await prisma.provider.upsert({
      where: { name: provider.name },
      update: provider,
      create: provider,
    });
  }

  for (const api of MARKETPLACE_APIS) {
    await prisma.marketplaceApi.upsert({
      where: { slug: api.slug },
      update: api,
      create: api,
    });
  }

  console.log(`Seeded ${PROVIDERS.length} providers and ${MARKETPLACE_APIS.length} marketplace APIs.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

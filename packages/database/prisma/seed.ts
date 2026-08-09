import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';

const prisma = new PrismaClient();

/** Local-only demo credential so the seeded listing is exercisable against a freshly-seeded dev server. Never a real secret. */
const DEMO_PROVIDER_API_KEY = 'amk_demo_ledgerwatch_local_seed_only';
const DEMO_ALGORAND_ADDRESS = 'A'.repeat(58);

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

  let analyzeApi: { id: string } | undefined;
  for (const api of MARKETPLACE_APIS) {
    const created = await prisma.marketplaceApi.upsert({
      where: { slug: api.slug },
      update: api,
      create: api,
    });
    if (api.slug === 'analyze') analyzeApi = created;
  }

  // One demo third-party provider + published listing, so a freshly-seeded
  // dev server shows the control-plane/publishing pipeline actually working
  // end to end, not just AgentMarket's own first-party endpoints.
  const demoProvider = await prisma.providerAccount.upsert({
    where: { email: 'devrel@ledgerwatch.example' },
    update: {},
    create: {
      name: 'Ledgerwatch Labs',
      email: 'devrel@ledgerwatch.example',
      walletAddress: DEMO_ALGORAND_ADDRESS,
      apiKeyHash: createHash('sha256').update(DEMO_PROVIDER_API_KEY).digest('hex'),
      status: 'verified',
      verifiedAt: new Date(),
    },
  });

  const demoListing = await prisma.apiListing.upsert({
    where: { slug: 'chainscan-wallet-risk' },
    update: {},
    create: {
      providerAccountId: demoProvider.id,
      slug: 'chainscan-wallet-risk',
      name: 'ChainScan — Wallet Risk Feed',
      description:
        'Flags wallets with elevated on-chain risk before a payout, scored from live Algorand transaction graphs.',
      category: 'Risk & Compliance',
      tags: JSON.stringify(['wallets', 'fraud', 'on-chain']),
      upstreamUrl: 'https://api.ledgerwatch.example/v1/wallet-risk',
      docsUrl: 'https://docs.ledgerwatch.example',
      pricingModel: 'pay_per_call',
      priceUsd: 0.03,
      payoutWalletAddress: DEMO_ALGORAND_ADDRESS,
      status: 'published',
      publishedAt: new Date(),
    },
  });

  // A "Featured" shelf (Phase 10) so a freshly-seeded dev server shows the
  // storefront's curated-collection mechanism actually working, not an
  // empty section. Admin/operator-curated only — see Collection's schema comment.
  if (analyzeApi) {
    await prisma.collection.upsert({
      where: { slug: 'featured' },
      update: {},
      create: {
        slug: 'featured',
        name: 'Featured',
        description: 'Hand-picked endpoints worth trying first.',
        listingIds: JSON.stringify([analyzeApi.id, demoListing.id]),
        position: 0,
      },
    });
  }

  console.log(
    `Seeded ${PROVIDERS.length} providers, ${MARKETPLACE_APIS.length} marketplace APIs, 1 demo third-party listing, and 1 featured collection.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

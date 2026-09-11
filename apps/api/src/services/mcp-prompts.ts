export interface McpPromptArgument {
  name: string;
  description: string;
  required: boolean;
}

export interface McpPromptDescriptor {
  name: string;
  description: string;
  arguments: McpPromptArgument[];
}

/**
 * Phase 8's prompts — reusable instructions that compose the *existing*
 * tools (discover_capabilities plus the financial-intelligence catalog),
 * never new business logic of their own. Each one is a fixed text template;
 * the actual work still happens through tools/call against the same catalog
 * every other MCP client sees.
 */
export const MCP_PROMPTS: McpPromptDescriptor[] = [
  {
    name: 'analyze_market',
    description: 'Full market read on one asset: sentiment, risk, technicals, and a synthesized view.',
    arguments: [{ name: 'symbol', description: 'Asset symbol, e.g. BTC', required: true }],
  },
  {
    name: 'compare_market_signals',
    description: 'Compares sentiment/risk/technical signals across two or more assets.',
    arguments: [{ name: 'symbols', description: 'Comma-separated symbols, e.g. "BTC,ETH,SOL"', required: true }],
  },
  {
    name: 'assess_portfolio_risk',
    description: "Runs portfolio-health and execution-readiness against a holdings list to judge a portfolio's risk posture.",
    arguments: [{ name: 'holdings', description: 'JSON array of {symbol, quantity}', required: true }],
  },
  {
    name: 'find_best_market_data_provider',
    description: 'Uses discover_capabilities to rank marketplace listings against a stated need (latency/cost/trust tradeoffs).',
    arguments: [{ name: 'need', description: 'Free-text description of the capability needed, e.g. "low-latency crypto sentiment"', required: true }],
  },
];

function requireArg(args: Record<string, string>, name: string): string {
  const value = args[name];
  if (!value) throw new Error(`Missing required prompt argument "${name}".`);
  return value;
}

/** Renders one prompt's fixed template against caller-supplied arguments — plain string interpolation, no templating engine needed for four short prompts. */
export function renderMcpPrompt(name: string, args: Record<string, string>): string {
  switch (name) {
    case 'analyze_market': {
      const symbol = requireArg(args, 'symbol');
      return (
        `Call sentiment_analysis, risk_analysis, technical_summary, and analyze_market for ${symbol} ` +
        '(the AgentMarket tools agentmarket__get_v1_sentiment, agentmarket__get_v1_risk_analysis, ' +
        'agentmarket__get_v1_technical_summary, agentmarket__get_v1_analyze — pass symbol as the argument to each). ' +
        `Synthesize the four results into one assessment of ${symbol}: overall stance, the strongest supporting ` +
        'signal, and the biggest risk flag. Each tool is x402-metered — if a call returns PAYMENT_REQUIRED, pay it ' +
        'before continuing.'
      );
    }
    case 'compare_market_signals': {
      const symbols = requireArg(args, 'symbols')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      return (
        `For each of ${symbols.join(', ')}, call agentmarket__get_v1_sentiment, agentmarket__get_v1_risk_analysis, ` +
        'and agentmarket__get_v1_technical_summary with that symbol. Build a comparison table (one row per asset, ' +
        'one column per signal) and call out which asset looks strongest and why.'
      );
    }
    case 'assess_portfolio_risk': {
      const holdings = requireArg(args, 'holdings');
      return (
        `Call agentmarket__post_v1_portfolio_health with body {"holdings": ${holdings}}, then call ` +
        'agentmarket__get_v1_execution_readiness for the portfolio\'s dominant asset. Summarize the portfolio\'s ' +
        'health score, its main concentration/risk issue, and whether conditions currently favor acting on it.'
      );
    }
    case 'find_best_market_data_provider': {
      const need = requireArg(args, 'need');
      return (
        `Call discover_capabilities with {"query": ${JSON.stringify(need)}}. From the ranked results, recommend ` +
        'the single best match, explaining the tradeoff versus the runner-up (price vs. trust score vs. latency, ' +
        'using the "reasons" field each result already includes).'
      );
    }
    default:
      throw new Error(`Unknown prompt "${name}".`);
  }
}

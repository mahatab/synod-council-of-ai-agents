import {
  pricingFromUsdPerMillion,
  estimateUsdCost,
  type CostBreakdown,
  type Pricing,
} from 'tokentally';

// Static pricing map: model ID → USD per 1M tokens.
// Keyed by exact model IDs from PROVIDERS in src/types/index.ts.
// Prices are best-effort estimates sourced from provider pricing pages (March 2025).
interface ModelPricingEntry {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
}

const PRICING_MAP: Record<string, ModelPricingEntry> = {
  // Anthropic
  'claude-opus-4-6':           { inputUsdPerMillion: 15.00, outputUsdPerMillion: 75.00 },
  'claude-sonnet-4-6':         { inputUsdPerMillion: 3.00,  outputUsdPerMillion: 15.00 },
  'claude-sonnet-4-5':         { inputUsdPerMillion: 3.00,  outputUsdPerMillion: 15.00 },
  'claude-haiku-4-5-20251001': { inputUsdPerMillion: 0.80,  outputUsdPerMillion: 4.00  },

  // OpenAI
  'gpt-5.2':      { inputUsdPerMillion: 2.00,  outputUsdPerMillion: 8.00  },
  'gpt-4.1':      { inputUsdPerMillion: 2.00,  outputUsdPerMillion: 8.00  },
  'gpt-4.1-mini': { inputUsdPerMillion: 0.40,  outputUsdPerMillion: 1.60  },
  'gpt-4.1-nano': { inputUsdPerMillion: 0.10,  outputUsdPerMillion: 0.40  },
  'gpt-4o':       { inputUsdPerMillion: 2.50,  outputUsdPerMillion: 10.00 },
  'gpt-4o-mini':  { inputUsdPerMillion: 0.15,  outputUsdPerMillion: 0.60  },
  'o3':           { inputUsdPerMillion: 2.00,  outputUsdPerMillion: 8.00  },
  'o3-mini':      { inputUsdPerMillion: 1.10,  outputUsdPerMillion: 4.40  },
  'o4-mini':      { inputUsdPerMillion: 1.10,  outputUsdPerMillion: 4.40  },

  // Google
  'gemini-2.5-pro':        { inputUsdPerMillion: 1.25,  outputUsdPerMillion: 10.00 },
  'gemini-2.5-flash':      { inputUsdPerMillion: 0.15,  outputUsdPerMillion: 0.60  },
  'gemini-2.5-flash-lite': { inputUsdPerMillion: 0.075, outputUsdPerMillion: 0.30  },

  // xAI
  'grok-4-0709': { inputUsdPerMillion: 3.00,  outputUsdPerMillion: 15.00 },
  'grok-3':      { inputUsdPerMillion: 3.00,  outputUsdPerMillion: 15.00 },
  'grok-3-mini': { inputUsdPerMillion: 0.30,  outputUsdPerMillion: 0.50  },

  // DeepSeek
  'deepseek-chat':     { inputUsdPerMillion: 0.27,  outputUsdPerMillion: 1.10  },
  'deepseek-reasoner': { inputUsdPerMillion: 0.55,  outputUsdPerMillion: 2.19  },

  // Mistral
  'mistral-large-latest':  { inputUsdPerMillion: 2.00,  outputUsdPerMillion: 6.00  },
  'mistral-medium-latest': { inputUsdPerMillion: 0.40,  outputUsdPerMillion: 2.00  },
  'mistral-small-latest':  { inputUsdPerMillion: 0.10,  outputUsdPerMillion: 0.30  },
  'codestral-latest':      { inputUsdPerMillion: 0.30,  outputUsdPerMillion: 0.90  },

  // Together AI
  'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8': { inputUsdPerMillion: 0.27, outputUsdPerMillion: 0.85 },
  'meta-llama/Llama-4-Scout-17B-16E-Instruct':         { inputUsdPerMillion: 0.18, outputUsdPerMillion: 0.59 },

  // Cohere
  'command-a-03-2025':      { inputUsdPerMillion: 2.50,  outputUsdPerMillion: 10.00 },
  'command-r-plus-08-2024': { inputUsdPerMillion: 2.50,  outputUsdPerMillion: 10.00 },
};

// Pre-compute Pricing objects for each model
const pricingCache = new Map<string, Pricing>();
function getPricing(modelId: string): Pricing | null {
  const entry = PRICING_MAP[modelId];
  if (!entry) return null;

  let pricing = pricingCache.get(modelId);
  if (!pricing) {
    pricing = pricingFromUsdPerMillion(entry);
    pricingCache.set(modelId, pricing);
  }
  return pricing;
}

/**
 * Calculate USD cost for a given model's token usage.
 * Returns null if the model has no pricing data.
 */
export function calculateModelCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): CostBreakdown | null {
  const pricing = getPricing(modelId);
  if (!pricing) return null;

  return estimateUsdCost({
    usage: { inputTokens, outputTokens },
    pricing,
  });
}

/**
 * Format a USD amount for display.
 * - Zero: "$0.00"
 * - Below $0.01: "<$0.01"
 * - Below $1: 2-4 significant decimal places (e.g., "$0.0042", "$0.15")
 * - $1 and above: 2 decimal places (e.g., "$1.50", "$23.45")
 */
export function formatUsdCost(usd: number): string {
  if (usd === 0) return '$0.00';
  if (usd < 0.01) return '<$0.01';
  if (usd < 1) {
    // Show enough precision to be meaningful
    const formatted = usd.toFixed(4).replace(/0+$/, '');
    const parts = formatted.split('.');
    const decimals = parts[1] || '00';
    return `$${parts[0]}.${decimals.length < 2 ? decimals + '0' : decimals}`;
  }
  return `$${usd.toFixed(2)}`;
}

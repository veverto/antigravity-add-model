/**
 * Pricing tables and token cost estimation for AI models and providers.
 * Prices are in USD per 1 Million tokens.
 */

import { findDynamicModelPricing } from './modelSpecs';
import { ModelPricing } from './types';

export type { ModelPricing };

export const KNOWN_MODEL_PRICING: Record<string, ModelPricing> = {
  // DeepSeek
  'deepseek-chat': { inputPerMillion: 0.14, outputPerMillion: 0.28 },
  'deepseek-v3': { inputPerMillion: 0.14, outputPerMillion: 0.28 },
  'deepseek-v4': { inputPerMillion: 0.14, outputPerMillion: 0.28 },
  'deepseek': { inputPerMillion: 0.14, outputPerMillion: 0.28 },
  'deepseek-reasoner': { inputPerMillion: 0.55, outputPerMillion: 2.19 },
  'deepseek-r1': { inputPerMillion: 0.55, outputPerMillion: 2.19 },

  // Google (OpenRouter / AI Studio)
  'gemini-3.8-flash': { inputPerMillion: 0.10, outputPerMillion: 0.40 },
  'gemini-2.5-flash': { inputPerMillion: 0.075, outputPerMillion: 0.30 },
  'gemini-flash': { inputPerMillion: 0.075, outputPerMillion: 0.30 },

  // OpenAI
  'gpt-4o': { inputPerMillion: 2.50, outputPerMillion: 10.00 },
  'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.60 },
  'o1': { inputPerMillion: 15.00, outputPerMillion: 60.00 },
  'o1-mini': { inputPerMillion: 3.00, outputPerMillion: 12.00 },
  'o3-mini': { inputPerMillion: 1.10, outputPerMillion: 4.40 },
  'gpt-4-turbo': { inputPerMillion: 10.00, outputPerMillion: 30.00 },
  'gpt-3.5-turbo': { inputPerMillion: 0.50, outputPerMillion: 1.50 },

  // Anthropic
  'claude-3-5-sonnet': { inputPerMillion: 3.00, outputPerMillion: 15.00 },
  'claude-3-7-sonnet': { inputPerMillion: 3.00, outputPerMillion: 15.00 },
  'claude-3-5-haiku': { inputPerMillion: 0.80, outputPerMillion: 4.00 },
  'claude-3-opus': { inputPerMillion: 15.00, outputPerMillion: 75.00 },
  'claude-3-haiku': { inputPerMillion: 0.25, outputPerMillion: 1.25 },

  // Groq
  'llama-3.3-70b-versatile': { inputPerMillion: 0.59, outputPerMillion: 0.79 },
  'llama-3.1-70b-versatile': { inputPerMillion: 0.59, outputPerMillion: 0.79 },
  'llama-3.1-8b-instant': { inputPerMillion: 0.05, outputPerMillion: 0.08 },
  'mixtral-8x7b-32768': { inputPerMillion: 0.24, outputPerMillion: 0.24 },

  // Mistral
  'mistral-large-latest': { inputPerMillion: 2.00, outputPerMillion: 6.00 },
  'mistral-small-latest': { inputPerMillion: 0.20, outputPerMillion: 0.60 },
  'codestral-latest': { inputPerMillion: 0.30, outputPerMillion: 0.90 },

  // Cerebras
  'llama3.1-70b': { inputPerMillion: 0.60, outputPerMillion: 0.60 },
  'llama3.1-8b': { inputPerMillion: 0.10, outputPerMillion: 0.10 },
};

export const DEFAULT_FALLBACK_PRICING: ModelPricing = {
  inputPerMillion: 1.00,
  outputPerMillion: 3.00,
};

/**
 * Calculates estimated cost in USD based on provider, model, and token usage.
 * Follows a 3-tier hierarchy:
 * 1. Direct explicit cost from provider upstream response (e.g. usage.cost).
 * 2. Dynamic live pricing catalog from OpenRouter public models API (pricing.prompt & pricing.completion).
 * 3. Static local fallback table (KNOWN_MODEL_PRICING).
 */
export function calculateCost(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  explicitCost?: number,
): number {
  // Nível 1: Custo explícito direto do provedor upstream (usage.cost)
  if (typeof explicitCost === 'number' && explicitCost >= 0) {
    return explicitCost;
  }

  const p = (provider || '').toLowerCase();
  // Provedores locais ou gratuitos
  if (p === 'ollama' || p === 'lmstudio' || p === 'local') {
    return 0;
  }
  if (p === 'google' && !model.toLowerCase().includes('openrouter')) {
    return 0; // Google Native incluso na cota
  }

  // Nível 2: Catálogo dinâmico do OpenRouter (em memória / TTL 1h)
  const dynamicPricing = findDynamicModelPricing(model);
  if (dynamicPricing) {
    const inCost = (inputTokens / 1_000_000) * dynamicPricing.inputPerMillion;
    const outCost = (outputTokens / 1_000_000) * dynamicPricing.outputPerMillion;
    return Number((inCost + outCost).toFixed(6));
  }

  // Nível 3: Tabela estática local (Fallback de segurança)
  const m = (model || '').toLowerCase();
  let pricing = DEFAULT_FALLBACK_PRICING;

  // Busca melhor correspondência conhecida na tabela
  for (const [key, val] of Object.entries(KNOWN_MODEL_PRICING)) {
    if (m.includes(key.toLowerCase())) {
      pricing = val;
      break;
    }
  }

  const inputCost = (inputTokens / 1_000_000) * pricing.inputPerMillion;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPerMillion;
  return Number((inputCost + outputCost).toFixed(6));
}

/**
 * Heuristic token estimation if tokenizer metadata is unavailable (~4 chars per token).
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}


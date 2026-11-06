import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { calculateCost, estimateTokens, KNOWN_MODEL_PRICING } from '../proxy/pricing';
import { setCachedOpenRouterModelsForTesting } from '../proxy/modelSpecs';

describe('Pricing and Cost Estimation Hierarchy', () => {
  beforeEach(() => {
    // Reset cache before each test
    setCachedOpenRouterModelsForTesting(null);
  });

  afterEach(() => {
    setCachedOpenRouterModelsForTesting(null);
  });

  it('Tier 1: should use explicit cost if provided (highest precedence)', () => {
    // Even if model has a dynamic or static price, explicitCost wins
    setCachedOpenRouterModelsForTesting([
      {
        id: 'openai/gpt-4o',
        name: 'GPT-4o',
        pricing: { prompt: '0.000005', completion: '0.000015' },
      },
    ]);
    const cost = calculateCost('openrouter', 'openai/gpt-4o', 10_000, 5_000, 0.0042);
    expect(cost).toBe(0.0042);
  });

  it('Tier 2: should use dynamic OpenRouter catalog pricing when available', () => {
    // Simulated dynamic pricing: $2.00 input / 1M ($0.000002/tok), $8.00 output / 1M ($0.000008/tok)
    setCachedOpenRouterModelsForTesting([
      {
        id: 'special-org/custom-neural-v1',
        name: 'Custom Neural V1',
        pricing: { prompt: '0.000002', completion: '0.000008' },
      },
    ]);

    // 100k input = $0.20, 50k output = $0.40 -> total $0.60
    const cost = calculateCost('openrouter', 'special-org/custom-neural-v1', 100_000, 50_000);
    expect(cost).toBe(0.60);
  });

  it('Tier 2: should handle free models with prompt=0 and completion=0 in dynamic catalog', () => {
    setCachedOpenRouterModelsForTesting([
      {
        id: 'meta-llama/llama-3.2-3b-instruct:free',
        name: 'Llama 3.2 3B Free',
        pricing: { prompt: '0', completion: '0' },
      },
    ]);

    const cost = calculateCost('openrouter', 'meta-llama/llama-3.2-3b-instruct:free', 50_000, 10_000);
    expect(cost).toBe(0);
  });

  it('Tier 3: should fallback to static known pricing when dynamic catalog has no match', () => {
    setCachedOpenRouterModelsForTesting([]); // empty dynamic catalog

    // deepseek-chat: $0.14 input, $0.28 output per M
    // 100k input = $0.014, 50k output = $0.014 -> total $0.028
    const cost = calculateCost('deepseek', 'deepseek-chat', 100_000, 50_000);
    expect(cost).toBe(0.028);
  });

  it('Tier 3: should fallback to DEFAULT_FALLBACK_PRICING when completely unknown', () => {
    setCachedOpenRouterModelsForTesting([]);
    // fallback: $1.00 input, $3.00 output per M
    // 10k input = $0.01, 10k output = $0.03 -> total $0.04
    const cost = calculateCost('custom', 'my-fine-tuned-model', 10_000, 10_000);
    expect(cost).toBe(0.04);
  });

  it('should return 0 cost for local providers like ollama and lmstudio', () => {
    expect(calculateCost('ollama', 'llama3', 10000, 5000)).toBe(0);
    expect(calculateCost('lmstudio', 'qwen2.5-coder', 10000, 5000)).toBe(0);
  });

  it('should return 0 cost for native google models', () => {
    expect(calculateCost('google', 'gemini-2.5-flash', 10000, 5000)).toBe(0);
  });

  it('should estimate tokens based on character length', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('Hello, world! This is a test.')).toBe(Math.ceil(29 / 4));
  });
});


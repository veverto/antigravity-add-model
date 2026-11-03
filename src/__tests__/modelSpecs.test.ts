import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveModelSpec, POPULAR_MODELS_PRESETS } from '../proxy/modelSpecs';

describe('modelSpecs', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should preserve explicitly provided context and output limits', async () => {
    const spec = await resolveModelSpec('custom/my-model', 65536, 4096);
    expect(spec.contextWindow).toBe(65536);
    expect(spec.maxOutputTokens).toBe(4096);
  });

  it('should detect Gemini family context window (at least 1M tokens)', async () => {
    const spec = await resolveModelSpec('google/gemini-2.5-flash');
    expect(spec.contextWindow).toBeGreaterThanOrEqual(1_000_000);
    expect(spec.maxOutputTokens).toBeGreaterThanOrEqual(8_192);
  });

  it('should detect Claude family context window (at least 200k tokens)', async () => {
    const spec = await resolveModelSpec('anthropic/claude-3-5-sonnet');
    expect(spec.contextWindow).toBeGreaterThanOrEqual(200_000);
    expect(spec.maxOutputTokens).toBeGreaterThanOrEqual(8_192);
  });

  it('should detect DeepSeek family context window (at least 128k tokens)', async () => {
    const spec = await resolveModelSpec('deepseek/deepseek-chat');
    expect(spec.contextWindow).toBeGreaterThanOrEqual(128_000);
    expect(spec.maxOutputTokens).toBeGreaterThanOrEqual(8_192);
  });

  it('should detect GPT-4 / o1 family limits (at least 128k context)', async () => {
    const spec = await resolveModelSpec('openai/gpt-4o');
    expect(spec.contextWindow).toBeGreaterThanOrEqual(128_000);
    expect(spec.maxOutputTokens).toBeGreaterThanOrEqual(4_096);
  });

  it('should provide safe generous defaults for unknown models', async () => {
    const spec = await resolveModelSpec('internal-team/unknown-expert-v1');
    expect(spec.contextWindow).toBe(128_000);
    expect(spec.maxOutputTokens).toBe(4_096);
  });

  it('should include popular model presets for supported providers', () => {
    expect(POPULAR_MODELS_PRESETS.openrouter.length).toBeGreaterThan(0);
    expect(POPULAR_MODELS_PRESETS.openai.length).toBeGreaterThan(0);
    expect(POPULAR_MODELS_PRESETS.deepseek.length).toBeGreaterThan(0);
    expect(POPULAR_MODELS_PRESETS.ollama.length).toBeGreaterThan(0);
  });
});

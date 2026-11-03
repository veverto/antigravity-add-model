import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchProviderQuota, fetchProviderModelsList, openrouterAdapter } from '../proxy/adapters';

describe('adapters', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetchProviderQuota should return null if provider has no apiKey', async () => {
    const quota = await fetchProviderQuota('openrouter', undefined);
    expect(quota).toBeNull();
  });

  it('openrouterAdapter.getQuota should correctly format balance and remainingFraction', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          label: 'test-key',
          usage: 5.0,
          limit: 20.0,
          is_free_tier: false,
        },
      }),
    } as any);

    const quota = await openrouterAdapter.getQuota!('sk-test-key-1234567890');
    expect(quota).not.toBeNull();
    expect(quota?.balanceUsd).toBe(15.0);
    expect(quota?.usageUsd).toBe(5.0);
    expect(quota?.remainingFraction).toBe(0.75);
    expect(quota?.refreshText).toContain('$15.00 restantes');
  });

  it('fetchProviderModelsList should return fallback presets for known provider if network fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    // ollama fallback
    const models = await fetchProviderModelsList('ollama');
    expect(models.length).toBeGreaterThan(0);
    expect(models[0].contextWindow).toBeGreaterThan(0);
  });
});

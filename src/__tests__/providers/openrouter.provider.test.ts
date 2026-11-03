import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenRouterProvider } from '../../proxy/providers/openrouter.provider';

describe('OpenRouterProvider - Especializações e Cotas', () => {
  let provider: OpenRouterProvider;

  beforeEach(() => {
    provider = new OpenRouterProvider();
    vi.restoreAllMocks();
  });

  it('deve possuir os metadados estáticos e getters de OpenRouter', () => {
    expect(provider.id).toBe('openrouter');
    expect(provider.displayName).toBe('OpenRouter');
    expect(provider.defaultBaseUrl).toBe('https://openrouter.ai/api/v1');
    expect(provider.isLocal).toBe(false);
  });

  it('deve incluir HTTP-Referer e X-Title nos cabeçalhos', () => {
    const headers = provider.getHeaders('sk-or-key-123');
    expect(headers['Authorization']).toBe('Bearer sk-or-key-123');
    expect(headers['HTTP-Referer']).toBe('https://antigravity.google');
    expect(headers['X-Title']).toBe('Antigravity IDE');
  });

  it('deve consultar cota em /auth/key e retornar ProviderQuotaInfo formatado', async () => {
    // Mock da chamada fetch para /auth/key
    const mockResponse = {
      data: {
        label: 'My API Key',
        usage: 5.25,
        limit: 20.0,
        limit_remaining: 14.75,
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as unknown as Response);

    const quota = await provider.getQuota('sk-or-key-123');
    expect(quota).not.toBeNull();
    expect(quota?.providerId).toBe('openrouter');
    expect(quota?.providerName).toBe('OpenRouter');
    expect(quota?.usageUsd).toBe(5.25);
    expect(quota?.limitUsd).toBe(20.0);
    expect(quota?.balanceUsd).toBe(14.75);
    expect(quota?.refreshText).toContain('$14.75 restantes');
  });

  it('deve retornar null se apiKey não for informada em getQuota', async () => {
    const quota = await provider.getQuota();
    expect(quota).toBeNull();
  });
});

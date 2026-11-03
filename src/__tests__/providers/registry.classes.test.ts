import { describe, it, expect } from 'vitest';
import { ProviderRegistry } from '../../proxy/registry';
import {
  REGISTERED_PROVIDERS,
  OpenRouterProvider,
  OllamaProvider,
  DeepSeekProvider,
  AnthropicProvider,
  GoogleProvider,
} from '../../proxy/providers';

describe('ProviderRegistry - Arquitetura Baseada em Classes', () => {
  const registry = new ProviderRegistry();

  it('deve registrar todos os provedores do catálogo REGISTERED_PROVIDERS', () => {
    expect(REGISTERED_PROVIDERS.length).toBeGreaterThanOrEqual(6);

    const openrouter = registry.get('openrouter');
    expect(openrouter).toBeInstanceOf(OpenRouterProvider);

    const ollama = registry.get('ollama');
    expect(ollama).toBeInstanceOf(OllamaProvider);
    expect(ollama?.isLocal).toBe(true);

    const deepseek = registry.get('deepseek');
    expect(deepseek).toBeInstanceOf(DeepSeekProvider);

    const anthropic = registry.get('anthropic');
    expect(anthropic).toBeInstanceOf(AnthropicProvider);

    const google = registry.get('google');
    expect(google).toBeInstanceOf(GoogleProvider);
  });

  it('getAvailableProviders deve retornar metadados estáticos para consumo da UI', () => {
    const list = registry.getAvailableProviders();
    expect(list.length).toBe(REGISTERED_PROVIDERS.length);

    const orMeta = list.find((p) => p.id === 'openrouter');
    expect(orMeta).toBeDefined();
    expect(orMeta?.displayName).toBe('OpenRouter');
    expect(orMeta?.defaultBaseUrl).toBe('https://openrouter.ai/api/v1');
    expect(orMeta?.isLocal).toBe(false);

    const ollamaMeta = list.find((p) => p.id === 'ollama');
    expect(ollamaMeta).toBeDefined();
    expect(ollamaMeta?.isLocal).toBe(true);
  });

  it('deve delegar getProviderHeaders para o provedor correspondente', () => {
    const orHeaders = registry.getProviderHeaders('openrouter', 'sk-or-test');
    expect(orHeaders['Authorization']).toBe('Bearer sk-or-test');
    expect(orHeaders['HTTP-Referer']).toBe('https://antigravity.google');
    expect(orHeaders['X-Title']).toBe('Antigravity IDE');

    const anthHeaders = registry.getProviderHeaders('anthropic', 'sk-ant-test');
    expect(anthHeaders['x-api-key']).toBe('sk-ant-test');
    expect(anthHeaders['anthropic-beta']).toBe('prompt-caching-2024-07-31');
  });

  it('deve delegar getQuota e retornar cota infinita para provedor local', async () => {
    const quota = await registry.getQuota('ollama');
    expect(quota).toEqual({
      providerId: 'ollama',
      providerName: 'Ollama (Local)',
      remainingFraction: 1.0,
      refreshText: 'Ilimitado (Execução Local)',
    });
  });

  it('deve aplicar poda de histórico ao chamar translateRequest via registry', () => {
    const largeOld = 'M'.repeat(5000);
    const body = {
      contents: [
        { role: 'user', parts: [{ text: 'Turno 1' }] },
        { role: 'function', parts: [{ functionResponse: { name: 'view_file', response: largeOld } }] },
        { role: 'user', parts: [{ text: 'Turno ativo' }] },
      ],
    };

    const res = registry.translateRequest('openrouter', body, 'google/gemini-2.5-flash') as {
      messages: Array<{ role: string; content: string }>;
    };

    expect(res.messages).toBeDefined();
    const toolMsg = res.messages.find((m) => m.role === 'tool');
    expect(toolMsg?.content).not.toContain(largeOld);
    expect(toolMsg?.content).toContain('omitido do histórico');
  });
});

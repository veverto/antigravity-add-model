import { describe, it, expect } from 'vitest';
import { AnthropicProvider } from '../../proxy/providers/anthropic.provider';
import { GeminiRequestBody } from '../../proxy/types';

describe('AnthropicProvider - Protocolo e Headers de Cache', () => {
  const provider = new AnthropicProvider();

  it('deve possuir os metadados estáticos e getters corretos', () => {
    expect(provider.id).toBe('anthropic');
    expect(provider.displayName).toBe('Anthropic');
    expect(provider.defaultBaseUrl).toBe('https://api.anthropic.com/v1');
    expect(provider.isLocal).toBe(false);
  });

  it('deve incluir x-api-key, anthropic-version e anthropic-beta nos cabeçalhos', () => {
    const headers = provider.getHeaders('sk-ant-test-key');
    expect(headers['x-api-key']).toBe('sk-ant-test-key');
    expect(headers['anthropic-version']).toBe('2025-04-01');
    expect(headers['anthropic-beta']).toBe('prompt-caching-2024-07-31');
  });

  it('deve traduzir a requisição para formato Anthropic aplicando a poda herdada de BaseProvider', () => {
    const body: GeminiRequestBody = {
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Explique a teoria da relatividade' }],
        },
      ],
    };

    const payload = provider.translateRequest(body, 'claude-3-5-sonnet-20241022') as {
      model: string;
      messages: Array<{ role: string; content: string }>;
    };

    expect(payload.model).toBe('claude-3-5-sonnet-20241022');
    expect(payload.messages).toBeDefined();
    expect(payload.messages[0].role).toBe('user');
  });

  it('deve formatar a URL para /messages', () => {
    const url = provider.getUrl('https://api.anthropic.com/v1', 'claude-3-5-sonnet', false);
    expect(url).toBe('https://api.anthropic.com/v1/messages');
  });
});

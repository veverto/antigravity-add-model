import { describe, it, expect } from 'vitest';
import { OpenAIProvider } from '../../proxy/providers/openai.provider';
import { GeminiRequestBody } from '../../proxy/types';

describe('OpenAIProvider - Protocolo e Mapeamentos', () => {
  const provider = new OpenAIProvider();

  it('deve possuir os metadados estáticos e getters corretos', () => {
    expect(provider.id).toBe('openai');
    expect(provider.displayName).toBe('OpenAI');
    expect(provider.defaultBaseUrl).toBe('https://api.openai.com/v1');
    expect(provider.isLocal).toBe(false);
  });

  it('deve gerar cabeçalhos padrão com Authorization Bearer', () => {
    const headers = provider.getHeaders('sk-test-openai-key');
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['Authorization']).toBe('Bearer sk-test-openai-key');
  });

  it('deve traduzir uma requisição Gemini para o formato OpenAI com histórico podado', () => {
    const body: GeminiRequestBody = {
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Como você está?' }],
        },
      ],
    };

    const payload = provider.translateRequest(body, 'gpt-4o') as {
      model: string;
      messages: Array<{ role: string; content: string }>;
    };

    expect(payload.model).toBe('gpt-4o');
    expect(payload.messages).toBeDefined();
    expect(payload.messages.some((m) => m.content === 'Como você está?')).toBe(true);
  });

  it('deve normalizar a URL para /chat/completions', () => {
    const url = provider.getUrl('https://api.openai.com/v1', 'gpt-4o', false);
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
  });
});

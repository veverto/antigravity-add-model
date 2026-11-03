import { describe, it, expect } from 'vitest';
import { GoogleProvider } from '../../proxy/providers/google.provider';
import { GeminiRequestBody } from '../../proxy/types';

describe('GoogleProvider - Passthrough e Cota', () => {
  const provider = new GoogleProvider();

  it('deve possuir os metadados estáticos e getters corretos', () => {
    expect(provider.id).toBe('google');
    expect(provider.displayName).toBe('Google AI Studio');
    expect(provider.defaultBaseUrl).toBe('https://generativelanguage.googleapis.com/v1beta');
    expect(provider.isLocal).toBe(false);
  });

  it('deve incluir x-goog-api-key nos cabeçalhos', () => {
    const headers = provider.getHeaders('google-api-key-xyz');
    expect(headers['x-goog-api-key']).toBe('google-api-key-xyz');
  });

  it('deve traduzir a requisição aplicando a poda herdada de BaseProvider', () => {
    const largeOld = 'Z'.repeat(6000);
    const body: GeminiRequestBody = {
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Pergunta anterior' }],
        },
        {
          role: 'function',
          parts: [
            {
              functionResponse: {
                name: 'view_file',
                response: largeOld,
              },
            },
          ],
        },
        {
          role: 'user',
          parts: [{ text: 'Pergunta atual' }],
        },
      ],
    };

    const res = provider.translateRequest(body, 'gemini-2.5-flash') as GeminiRequestBody;
    expect(res.contents).toBeDefined();

    // A ferramenta do turno anterior deve ter sido podada
    const toolPart = res.contents![1].parts![0].functionResponse?.response;
    const toolStr = typeof toolPart === 'string' ? toolPart : JSON.stringify(toolPart);
    expect(toolStr).not.toContain(largeOld);
    expect(toolStr).toContain('omitido do histórico');
  });

  it('deve construir a URL correta com streamGenerateContent para streaming', () => {
    const urlStream = provider.getUrl('https://generativelanguage.googleapis.com/v1beta', 'gemini-2.5-flash', true);
    expect(urlStream).toContain('streamGenerateContent?alt=sse');

    const urlNonStream = provider.getUrl('https://generativelanguage.googleapis.com/v1beta', 'gemini-2.5-flash', false);
    expect(urlNonStream).toContain('generateContent');
  });
});

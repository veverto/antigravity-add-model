import { describe, it, expect } from 'vitest';
import { OllamaProvider } from '../../proxy/providers/ollama.provider';

describe('OllamaProvider - Modelo Local e Normalização', () => {
  const provider = new OllamaProvider();

  it('deve ter isLocal = true e cota infinita herdada', async () => {
    expect(provider.id).toBe('ollama');
    expect(provider.displayName).toBe('Ollama (Local)');
    expect(provider.isLocal).toBe(true);

    const quota = await provider.getQuota();
    expect(quota).toEqual({
      providerId: 'ollama',
      providerName: 'Ollama (Local)',
      remainingFraction: 1.0,
      refreshText: 'Ilimitado (Execução Local)',
    });
  });

  it('deve normalizar a URL para localhost:11434/v1/chat/completions', () => {
    const url1 = provider.getUrl('http://localhost:11434', 'llama3', false);
    expect(url1).toBe('http://localhost:11434/v1/chat/completions');

    const url2 = provider.getUrl('http://127.0.0.1:11434/v1', 'llama3', false);
    expect(url2).toBe('http://127.0.0.1:11434/v1/chat/completions');
  });
});

/**
 * OpenRouter Provider Translator.
 * Re-exports OpenAI mappings and adds OpenRouter specific headers/balance checking.
 */
export { mapGeminiToOpenAI, mapOpenAIToGemini, mapOpenAIChunkToGemini } from './openai';

export function getProviderHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
    'HTTP-Referer': 'https://antigravity.google',
    'X-Title': 'Antigravity IDE',
  };
}

export async function checkBalance(apiKey: string): Promise<{ limit?: number; usage?: number } | null> {
  if (!apiKey || apiKey === 'none') return null;
  try {
    const https = await import('https');
    return new Promise((resolve) => {
      const req = https.request(
        'https://openrouter.ai/api/v1/auth/key',
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        },
        (res) => {
          let data = '';
          res.on('data', (c: Buffer) => (data += c.toString('utf-8')));
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              if (json?.data) {
                resolve({ limit: json.data.limit, usage: json.data.usage });
              } else {
                resolve(null);
              }
            } catch {
              resolve(null);
            }
          });
        },
      );
      req.on('error', () => resolve(null));
      req.setTimeout(5000, () => {
        req.destroy();
        resolve(null);
      });
      req.end();
    });
  } catch {
    return null;
  }
}

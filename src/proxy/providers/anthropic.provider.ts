/**
 * AnthropicProvider: Implementação para Claude e API Messages da Anthropic.
 *
 * Configura:
 * - Cabeçalhos oficiais (x-api-key, anthropic-version: '2025-04-01', anthropic-beta: 'prompt-caching-2024-07-31').
 * - Tradução de ferramentas e blocos de raciocínio (thinking).
 * - Poda universal de histórico herdada automaticamente da BaseProvider.
 */

import { BaseProvider } from './base.provider';
import {
  GeminiRequestBody,
  ModelTokenConfig,
  ProviderHeaders,
} from '../types';
import {
  mapGeminiToAnthropic,
  mapAnthropicToGemini,
  mapAnthropicChunkToGemini,
} from '../translators/anthropic';

export class AnthropicProvider extends BaseProvider {
  static override readonly id: string = 'anthropic';
  static override readonly displayName: string = 'Anthropic';
  static override readonly defaultBaseUrl: string = 'https://api.anthropic.com/v1';
  static override readonly isLocal: boolean = false;

  formatPayload(
    geminiBody: GeminiRequestBody,
    modelName: string,
    _effort?: string,
    tokenConfig?: ModelTokenConfig,
  ): unknown {
    return mapGeminiToAnthropic(geminiBody, modelName, tokenConfig);
  }

  translateResponse(providerRes: unknown, modelName: string): unknown {
    return mapAnthropicToGemini(providerRes as any, modelName);
  }

  translateStreamChunk(chunk: unknown, modelName: string): unknown | null {
    return mapAnthropicChunkToGemini(chunk as any, modelName);
  }

  getHeaders(apiKey?: string): ProviderHeaders {
    const headers: ProviderHeaders = {
      'Content-Type': 'application/json',
      'anthropic-version': '2025-04-01',
      'anthropic-beta': 'prompt-caching-2024-07-31',
    };
    if (apiKey && apiKey !== 'none') {
      headers['x-api-key'] = apiKey;
    }
    return headers;
  }

  getUrl(baseUrl: string, _modelName: string, _isStream: boolean): string {
    const base = (baseUrl || this.defaultBaseUrl).replace(/\/+$/, '');
    if (base.endsWith('/messages')) return base;
    return `${base}/messages`;
  }
}

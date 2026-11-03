/**
 * GoogleProvider: Implementação para Google AI Studio (Gemini nativo).
 *
 * Configura:
 * - Cabeçalho de autenticação (x-goog-api-key).
 * - URLs dinâmicas para streaming (:streamGenerateContent?alt=sse) e non-streaming (:generateContent).
 * - Poda universal de histórico herdada da BaseProvider.
 */

import { BaseProvider } from './base.provider';
import {
  GeminiRequestBody,
  ModelTokenConfig,
  ProviderHeaders,
} from '../types';
import {
  mapGeminiToGoogle,
  mapGoogleToGemini,
  mapGoogleChunkToGemini,
  getGoogleApiUrl,
} from '../translators/google';

export class GoogleProvider extends BaseProvider {
  static override readonly id: string = 'google';
  static override readonly displayName: string = 'Google AI Studio';
  static override readonly defaultBaseUrl: string =
    'https://generativelanguage.googleapis.com/v1beta';
  static override readonly isLocal: boolean = false;

  formatPayload(
    geminiBody: GeminiRequestBody,
    modelName: string,
    _effort?: string,
    _tokenConfig?: ModelTokenConfig,
  ): unknown {
    return mapGeminiToGoogle(geminiBody as any, modelName);
  }

  translateResponse(providerRes: unknown, modelName: string): unknown {
    return mapGoogleToGemini(providerRes, modelName);
  }

  translateStreamChunk(chunk: unknown, modelName: string): unknown | null {
    return mapGoogleChunkToGemini(chunk, modelName);
  }

  getHeaders(apiKey?: string): ProviderHeaders {
    const headers: ProviderHeaders = { 'Content-Type': 'application/json' };
    if (apiKey && apiKey !== 'none') {
      headers['x-goog-api-key'] = apiKey;
    }
    return headers;
  }

  getUrl(baseUrl: string, modelName: string, isStream: boolean): string {
    let url = getGoogleApiUrl(baseUrl || this.defaultBaseUrl, modelName, isStream);
    if (isStream && !url.includes('alt=sse')) {
      url += (url.includes('?') ? '&' : '?') + 'alt=sse';
    }
    return url;
  }
}

/**
 * OpenAIProvider: Provedor Base para a Família OpenAI / Wire Protocol /v1/chat/completions.
 *
 * Implementa tradução de requisições, respostas e streaming SSE no padrão OpenAI.
 * Serve como base para provedores compatíveis (OpenRouter, DeepSeek, Ollama, Groq, Mistral, etc.).
 */

import { BaseProvider } from './base.provider';
import {
  GeminiRequestBody,
  ModelTokenConfig,
  ProviderHeaders,
} from '../types';
import {
  mapGeminiToOpenAI,
  mapOpenAIToGemini,
  mapOpenAIChunkToGemini,
} from '../translators/openai';
import { normalizeChatCompletionsUrl } from '../modelUtils';

export class OpenAIProvider extends BaseProvider {
  static override readonly id: string = 'openai';
  static override readonly displayName: string = 'OpenAI';
  static override readonly defaultBaseUrl: string = 'https://api.openai.com/v1';
  static override readonly isLocal: boolean = false;

  formatPayload(
    geminiBody: GeminiRequestBody,
    modelName: string,
    effort?: string,
    tokenConfig?: ModelTokenConfig,
  ): unknown {
    return mapGeminiToOpenAI(geminiBody, modelName, effort, tokenConfig);
  }

  translateResponse(providerRes: unknown, modelName: string): unknown {
    return mapOpenAIToGemini(providerRes as any, modelName);
  }

  translateStreamChunk(chunk: unknown, modelName: string): unknown | null {
    return mapOpenAIChunkToGemini(chunk as any, modelName);
  }

  getHeaders(apiKey?: string): ProviderHeaders {
    return {
      'Content-Type': 'application/json',
      ...(apiKey && apiKey !== 'none' ? { Authorization: `Bearer ${apiKey}` } : {}),
    };
  }

  getUrl(baseUrl: string, _modelName: string, _isStream: boolean): string {
    return normalizeChatCompletionsUrl(baseUrl || this.defaultBaseUrl);
  }
}

/**
 * Provider Translator Registry.
 *
 * Gerencia a hierarquia de classes BaseProvider através de um catálogo declarativo
 * tipado (REGISTERED_PROVIDERS), eliminando dependências frágeis de fs.readdirSync.
 *
 * Expõe a classe ProviderRegistry e funções utilitárias que mantêm 100% de compatibilidade
 * com o proxy.ts, autoSwitch/verifier.ts e a suíte de testes existente.
 */

import log from 'electron-log';
import {
  ModelTokenConfig,
  ProviderHeaders,
  ProviderQuotaInfo,
  ProviderMetadata,
  GeminiRequestBody,
} from './types';
import {
  BaseProvider,
  REGISTERED_PROVIDERS,
} from './providers';
import { normalizeChatCompletionsUrl } from './modelUtils';

// Re-export types
export { ModelTokenConfig, ProviderHeaders, ProviderQuotaInfo, ProviderMetadata, normalizeChatCompletionsUrl };

export interface TranslatorModule {
  mapGeminiToOpenAI?: (body: unknown, modelName: string, effort?: string, tokenConfig?: ModelTokenConfig) => unknown;
  mapOpenAIToGemini?: (res: unknown, modelName: string) => unknown;
  mapOpenAIChunkToGemini?: (chunk: unknown, modelName: string) => unknown | null;
  mapGeminiToAnthropic?: (body: unknown, modelName: string) => unknown;
  mapAnthropicToGemini?: (res: unknown, modelName: string) => unknown;
  mapAnthropicChunkToGemini?: (chunk: unknown, modelName: string) => unknown | null;
  mapGeminiToGoogle?: (body: unknown, modelName: string, effort?: string) => unknown;
  mapGoogleToGemini?: (res: unknown, modelName: string) => unknown;
  mapGoogleChunkToGemini?: (chunk: unknown, modelName: string) => unknown | null;
  getGoogleApiUrl?: (baseUrl: string, modelName: string, isStream: boolean) => string;
  [key: string]: unknown;
}

// Grupos de compatibilidade de transporte
const OPENAI_COMPAT = new Set([
  'openai', 'ollama', 'openrouter', 'custom', 'groq', 'mistral',
  'cerebras', 'nvidia', 'opencode', 'codestral', 'together',
  'deepseek', 'kimi', 'fireworks', 'lmstudio', 'llamacpp', 'wafer', 'zai',
]);
const ANTHROPIC_COMPAT = new Set(['anthropic']);

// ─── ProviderRegistry (Classe Central) ────────────────────────────────────

export class ProviderRegistry {
  private instances = new Map<string, BaseProvider>();

  constructor(providers = REGISTERED_PROVIDERS) {
    for (const ProviderClass of providers) {
      this.register(ProviderClass);
    }
  }

  register(ProviderClass: (typeof REGISTERED_PROVIDERS)[number]): void {
    try {
      const instance = new ProviderClass();
      this.instances.set(ProviderClass.id.toLowerCase(), instance);
    } catch (err) {
      log.error(`[ProviderRegistry] Falha ao registrar provedor "${ProviderClass.id}":`, (err as Error).message);
    }
  }

  get(providerId: string): BaseProvider | null {
    const norm = (providerId || '').toLowerCase().trim();
    if (this.instances.has(norm)) {
      return this.instances.get(norm)!;
    }
    if (OPENAI_COMPAT.has(norm)) {
      return this.instances.get('openai') || null;
    }
    if (ANTHROPIC_COMPAT.has(norm)) {
      return this.instances.get('anthropic') || null;
    }
    if (norm === 'google') {
      return this.instances.get('google') || null;
    }
    return this.instances.get('openai') || null;
  }

  /**
   * Retorna os metadados de todos os provedores registrados para alimentar a UI.
   */
  getAvailableProviders(): ProviderMetadata[] {
    return REGISTERED_PROVIDERS.map((P) => ({
      id: P.id,
      displayName: P.displayName,
      defaultBaseUrl: P.defaultBaseUrl,
      isLocal: P.isLocal ?? false,
    }));
  }

  translateRequest(
    provider: string,
    geminiBody: unknown,
    modelName: string,
    effort?: string,
    tokenConfig?: ModelTokenConfig,
  ): unknown {
    const p = this.get(provider);
    if (p) {
      return p.translateRequest(geminiBody as GeminiRequestBody, modelName, effort, tokenConfig);
    }
    return geminiBody;
  }

  translateResponse(provider: string, providerRes: unknown, modelName: string): unknown {
    const p = this.get(provider);
    if (p) {
      return p.translateResponse(providerRes, modelName);
    }
    return providerRes;
  }

  translateStreamChunk(provider: string, chunk: unknown, modelName: string): unknown {
    const p = this.get(provider);
    if (p) {
      return p.translateStreamChunk(chunk, modelName);
    }
    return null;
  }

  getProviderHeaders(provider: string, apiKey: string): ProviderHeaders {
    const p = this.get(provider);
    if (p) {
      return p.getHeaders(apiKey);
    }
    return { 'Content-Type': 'application/json' };
  }

  getProviderUrl(
    baseUrl: string,
    modelName: string,
    isStream: boolean,
    providerOrTranslator?: string | TranslatorModule | null,
  ): string {
    if (typeof providerOrTranslator === 'string') {
      const p = this.get(providerOrTranslator);
      if (p) return p.getUrl(baseUrl, modelName, isStream);
    }
    // Suporte a compatibilidade com translators legados
    if (providerOrTranslator && typeof providerOrTranslator === 'object') {
      if (typeof (providerOrTranslator as Record<string, unknown>).getGoogleApiUrl === 'function') {
        return ((providerOrTranslator as Record<string, unknown>).getGoogleApiUrl as (...args: unknown[]) => string)(baseUrl, modelName, isStream);
      }
      if (typeof (providerOrTranslator as Record<string, unknown>).getOllamaApiUrl === 'function') {
        return ((providerOrTranslator as Record<string, unknown>).getOllamaApiUrl as (...args: unknown[]) => string)(baseUrl);
      }
    }
    return normalizeChatCompletionsUrl(baseUrl);
  }

  async getQuota(provider: string, apiKey?: string, apiUrl?: string): Promise<ProviderQuotaInfo | null> {
    const p = this.get(provider);
    if (p) {
      return p.getQuota(apiKey, apiUrl);
    }
    return null;
  }

  supportsStreaming(provider: string): boolean {
    const p = this.get(provider);
    return p ? p.supportsStreaming() : true;
  }
}

export const defaultRegistry = new ProviderRegistry();

// ─── Funções Facade para Compatibilidade com proxy.ts e verifier.ts ───────

export function getTranslator(provider: string): TranslatorModule | null {
  const p = defaultRegistry.get(provider);
  if (!p) return null;
  return {
    mapGeminiToOpenAI: (body, modelName, effort, tokenConfig) => p.translateRequest(body as GeminiRequestBody, modelName, effort, tokenConfig),
    mapOpenAIToGemini: (res, modelName) => p.translateResponse(res, modelName),
    mapOpenAIChunkToGemini: (chunk, modelName) => p.translateStreamChunk(chunk, modelName),
    mapGeminiToAnthropic: (body, modelName) => p.translateRequest(body as GeminiRequestBody, modelName),
    mapAnthropicToGemini: (res, modelName) => p.translateResponse(res, modelName),
    mapAnthropicChunkToGemini: (chunk, modelName) => p.translateStreamChunk(chunk, modelName),
    mapGeminiToGoogle: (body, modelName) => p.translateRequest(body as GeminiRequestBody, modelName),
    mapGoogleToGemini: (res, modelName) => p.translateResponse(res, modelName),
    mapGoogleChunkToGemini: (chunk, modelName) => p.translateStreamChunk(chunk, modelName),
  };
}

export function translateRequest(
  provider: string,
  geminiBody: unknown,
  modelName: string,
  effort?: string,
  tokenConfig?: ModelTokenConfig,
): unknown {
  return defaultRegistry.translateRequest(provider, geminiBody, modelName, effort, tokenConfig);
}

export function translateResponse(provider: string, providerRes: unknown, modelName: string): unknown {
  return defaultRegistry.translateResponse(provider, providerRes, modelName);
}

export function translateStreamChunk(provider: string, chunk: unknown, modelName: string): unknown {
  return defaultRegistry.translateStreamChunk(provider, chunk, modelName);
}

export function getProviderHeaders(provider: string, apiKey: string): ProviderHeaders {
  return defaultRegistry.getProviderHeaders(provider, apiKey);
}

export function getProviderUrl(
  baseUrl: string,
  modelName: string,
  isStream: boolean,
  translator?: TranslatorModule | null,
): string {
  return defaultRegistry.getProviderUrl(baseUrl, modelName, isStream, translator);
}

export function supportsStreaming(provider: string): boolean {
  return defaultRegistry.supportsStreaming(provider);
}

/**
 * OpenRouterProvider: Especialização do OpenAIProvider para OpenRouter.
 *
 * Adiciona:
 * - Cabeçalhos obrigatórios HTTP-Referer e X-Title para atribuição e ranking.
 * - Consulta de cotas e saldo via /auth/key com cache de 60 segundos.
 */

import log from 'electron-log';
import { OpenAIProvider } from './openai.provider';
import { ProviderHeaders, ProviderQuotaInfo } from '../types';

interface CachedQuota {
  info: ProviderQuotaInfo;
  timestamp: number;
}

const quotaCache = new Map<string, CachedQuota>();
const QUOTA_CACHE_TTL = 60_000; // 60 segundos

export class OpenRouterProvider extends OpenAIProvider {
  static override readonly id: string = 'openrouter';
  static override readonly displayName: string = 'OpenRouter';
  static override readonly defaultBaseUrl: string = 'https://openrouter.ai/api/v1';
  static override readonly isLocal: boolean = false;

  override getHeaders(apiKey?: string): ProviderHeaders {
    return {
      ...super.getHeaders(apiKey),
      'HTTP-Referer': 'https://antigravity.google',
      'X-Title': 'Antigravity IDE',
    };
  }

  override async getQuota(apiKey?: string, apiUrl?: string): Promise<ProviderQuotaInfo | null> {
    if (!apiKey || apiKey === 'none') return null;

    const cacheKey = `openrouter:${apiKey.substring(0, 10)}`;
    const cached = quotaCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < QUOTA_CACHE_TTL) {
      return cached.info;
    }

    try {
      const cleanBase = (apiUrl || this.defaultBaseUrl).trim().replace(/\/+$/, '');
      const baseUrl = cleanBase.replace(/\/(chat\/completions|completions|messages)$/i, '');

      const res = await fetch(`${baseUrl}/auth/key`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'User-Agent': 'antigravity-byok',
        },
      });

      if (!res.ok) return null;

      const json = (await res.json()) as {
        data?: {
          label?: string;
          usage?: number;
          limit?: number;
          limit_remaining?: number;
          is_free_tier?: boolean;
          rate_limit?: { requests?: number; interval?: string };
        };
      };

      const keyData = json?.data;
      if (!keyData) return null;

      const usage = keyData.usage ?? 0;
      const limit = keyData.limit ?? 0;
      let remainingFraction = 1.0;
      let refreshText = '';

      if (limit > 0) {
        const remaining =
          keyData.limit_remaining !== undefined && keyData.limit_remaining !== null
            ? Math.max(0, keyData.limit_remaining)
            : Math.max(0, limit - usage);
        remainingFraction = Math.min(1.0, Math.max(0, remaining / limit));
        refreshText = `$${remaining.toFixed(2)} restantes (de $${limit.toFixed(2)})`;
      } else {
        refreshText = `$${usage.toFixed(2)} gastos (Sem limite)`;
      }

      const balanceUsd =
        limit > 0
          ? keyData.limit_remaining !== undefined && keyData.limit_remaining !== null
            ? keyData.limit_remaining
            : Math.max(0, limit - usage)
          : undefined;

      const info: ProviderQuotaInfo = {
        providerId: 'openrouter',
        providerName: 'OpenRouter',
        usageUsd: usage,
        limitUsd: limit > 0 ? limit : undefined,
        balanceUsd,
        remainingFraction,
        refreshText,
      };

      quotaCache.set(cacheKey, { info, timestamp: Date.now() });
      return info;
    } catch (err) {
      log.warn('[OpenRouterProvider] Falha ao verificar saldo /auth/key:', (err as Error).message);
      return null;
    }
  }
}

import log from 'electron-log';
import { IProviderAdapter, ProviderModelItem, ProviderQuotaInfo } from './types';
import { resolveModelSpec, POPULAR_MODELS_PRESETS } from './modelSpecs';

/**
 * Cache de quotas de provedores para evitar excesso de requisições às APIs externas.
 */
interface CachedQuota {
  info: ProviderQuotaInfo;
  timestamp: number;
}
const quotaCache = new Map<string, CachedQuota>();
const QUOTA_CACHE_TTL = 60_000; // 60 segundos

/**
 * Normaliza a URL base da API do provedor removendo endpoints como /chat/completions ou /messages.
 */
export function cleanApiBaseUrl(apiUrl?: string, defaultBase = 'https://openrouter.ai/api/v1'): string {
  if (!apiUrl) return defaultBase;
  let url = apiUrl.trim().replace(/\/+$/, '');
  url = url.replace(/\/(chat\/completions|completions|messages)$/i, '');
  return url || defaultBase;
}

/**
 * Adaptador para OpenRouter
 */
export const openrouterAdapter: IProviderAdapter = {
  id: 'openrouter',
  displayName: 'OpenRouter',
  defaultBaseUrl: 'https://openrouter.ai/api/v1',

  async listModels(apiKey?: string, apiUrl?: string): Promise<ProviderModelItem[]> {
    const baseUrl = cleanApiBaseUrl(apiUrl, 'https://openrouter.ai/api/v1');
    const headers: Record<string, string> = {
      'User-Agent': 'antigravity-byok',
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const res = await fetch(`${baseUrl}/models`, { headers });
    if (!res.ok) {
      throw new Error(`OpenRouter models failed with status ${res.status}`);
    }

    const json = (await res.json()) as {
      data?: Array<{
        id: string;
        name: string;
        context_length?: number;
        description?: string;
        top_provider?: { max_completion_tokens?: number };
      }>;
    };

    const popularIds = new Set(POPULAR_MODELS_PRESETS.openrouter?.map((p) => p.id) || []);

    const models: ProviderModelItem[] = (json.data || []).map((m) => {
      const isPop = popularIds.has(m.id);
      return {
        id: m.id,
        name: m.name || m.id,
        contextWindow: m.context_length || 128_000,
        maxOutputTokens: m.top_provider?.max_completion_tokens || 8_192,
        description: m.description,
        isPopular: isPop,
        provider: 'OpenRouter',
      };
    });

    // Ordena: populares primeiro, depois por nome
    return models.sort((a, b) => {
      if (a.isPopular && !b.isPopular) return -1;
      if (!a.isPopular && b.isPopular) return 1;
      return a.name.localeCompare(b.name);
    });
  },

  async getQuota(apiKey?: string, apiUrl?: string): Promise<ProviderQuotaInfo | null> {
    if (!apiKey) return null;

    const cacheKey = `openrouter:${apiKey.substring(0, 10)}`;
    const cached = quotaCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < QUOTA_CACHE_TTL) {
      return cached.info;
    }

    try {
      const baseUrl = cleanApiBaseUrl(apiUrl, 'https://openrouter.ai/api/v1');
      const res = await fetch(`${baseUrl}/auth/key`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'User-Agent': 'antigravity-byok',
        },
      });

      if (!res.ok) return null;

      const data = (await res.json()) as {
        data?: {
          label?: string;
          usage?: number;
          limit?: number;
          is_free_tier?: boolean;
          rate_limit?: { requests?: number; interval?: string };
        };
      };

      const keyData = data.data as {
        label?: string;
        usage?: number;
        limit?: number;
        limit_remaining?: number;
        is_free_tier?: boolean;
        rate_limit?: { requests?: number; interval?: string };
      } | undefined;
      if (!keyData) return null;

      const usage = keyData.usage ?? 0;
      const limit = keyData.limit ?? 0;
      let remainingFraction = 1.0;
      let refreshText = '';

      if (limit > 0) {
        const remaining = keyData.limit_remaining !== undefined && keyData.limit_remaining !== null
          ? Math.max(0, keyData.limit_remaining)
          : Math.max(0, limit - usage);
        remainingFraction = Math.min(1.0, Math.max(0, remaining / limit));
        refreshText = `$${remaining.toFixed(2)} restantes (de $${limit.toFixed(2)})`;
      } else {
        refreshText = `$${usage.toFixed(2)} gastos (Sem limite)`;
      }

      const balanceUsd = limit > 0
        ? (keyData.limit_remaining !== undefined && keyData.limit_remaining !== null
            ? keyData.limit_remaining
            : Math.max(0, limit - usage))
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
      log.warn('[OpenRouterAdapter] Erro ao buscar saldo /auth/key:', (err as Error).message);
      return null;
    }
  },
};

/**
 * Adaptador para Ollama (Local)
 */
export const ollamaAdapter: IProviderAdapter = {
  id: 'ollama',
  displayName: 'Ollama',
  defaultBaseUrl: 'http://localhost:11434',

  async listModels(_apiKey?: string, apiUrl?: string): Promise<ProviderModelItem[]> {
    const baseUrl = cleanApiBaseUrl(apiUrl, 'http://localhost:11434');
    const res = await fetch(`${baseUrl}/api/tags`);
    if (!res.ok) {
      throw new Error(`Ollama tags failed with status ${res.status}`);
    }

    const json = (await res.json()) as {
      models?: Array<{ name: string; details?: { parameter_size?: string } }>;
    };

    const models: ProviderModelItem[] = [];
    for (const m of json.models || []) {
      const spec = await resolveModelSpec(m.name);
      models.push({
        id: m.name,
        name: m.name,
        contextWindow: spec.contextWindow,
        maxOutputTokens: spec.maxOutputTokens,
        provider: 'Ollama',
      });
    }

    return models;
  },
};

/**
 * Adaptador para OpenAI
 */
export const openaiAdapter: IProviderAdapter = {
  id: 'openai',
  displayName: 'OpenAI',
  defaultBaseUrl: 'https://api.openai.com/v1',

  async listModels(apiKey?: string, apiUrl?: string): Promise<ProviderModelItem[]> {
    const baseUrl = cleanApiBaseUrl(apiUrl, 'https://api.openai.com/v1');
    const headers: Record<string, string> = {};
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const res = await fetch(`${baseUrl}/models`, { headers });
    if (!res.ok) {
      throw new Error(`OpenAI models failed with status ${res.status}`);
    }

    const json = (await res.json()) as { data?: Array<{ id: string }> };
    // Filtra modelos relevantes para chat (gpt-*, o1-*, o3-*)
    const chatModels = (json.data || []).filter(
      (m) => m.id.startsWith('gpt-') || m.id.startsWith('o1') || m.id.startsWith('o3'),
    );

    const popularIds = new Set(POPULAR_MODELS_PRESETS.openai?.map((p) => p.id) || []);
    const results: ProviderModelItem[] = [];

    for (const m of chatModels) {
      const spec = await resolveModelSpec(m.id);
      results.push({
        id: m.id,
        name: m.id,
        contextWindow: spec.contextWindow,
        maxOutputTokens: spec.maxOutputTokens,
        isPopular: popularIds.has(m.id),
        provider: 'OpenAI',
      });
    }

    return results.sort((a, b) => {
      if (a.isPopular && !b.isPopular) return -1;
      if (!a.isPopular && b.isPopular) return 1;
      return a.name.localeCompare(b.name);
    });
  },
};

/**
 * Adaptador para DeepSeek
 */
export const deepseekAdapter: IProviderAdapter = {
  id: 'deepseek',
  displayName: 'DeepSeek',
  defaultBaseUrl: 'https://api.deepseek.com',

  async listModels(apiKey?: string, apiUrl?: string): Promise<ProviderModelItem[]> {
    const baseUrl = cleanApiBaseUrl(apiUrl, 'https://api.deepseek.com');
    const headers: Record<string, string> = {};
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    try {
      const res = await fetch(`${baseUrl}/models`, { headers });
      if (res.ok) {
        const json = (await res.json()) as { data?: Array<{ id: string }> };
        const results: ProviderModelItem[] = [];
        for (const m of json.data || []) {
          const spec = await resolveModelSpec(m.id);
          results.push({
            id: m.id,
            name: m.id === 'deepseek-chat' ? 'DeepSeek-V3' : m.id === 'deepseek-reasoner' ? 'DeepSeek-R1' : m.id,
            contextWindow: spec.contextWindow,
            maxOutputTokens: spec.maxOutputTokens,
            isPopular: true,
            provider: 'DeepSeek',
          });
        }
        if (results.length > 0) return results;
      }
    } catch (_) {}

    // Fallback para modelos conhecidos do DeepSeek
    return [
      { id: 'deepseek-chat', name: 'DeepSeek-V3', contextWindow: 128_000, maxOutputTokens: 8_192, isPopular: true, provider: 'DeepSeek' },
      { id: 'deepseek-reasoner', name: 'DeepSeek-R1', contextWindow: 128_000, maxOutputTokens: 8_192, isPopular: true, provider: 'DeepSeek' },
    ];
  },
};

/**
 * Mapeamento geral de adaptadores disponíveis
 */
export const providerAdapters: Record<string, IProviderAdapter> = {
  openrouter: openrouterAdapter,
  ollama: ollamaAdapter,
  openai: openaiAdapter,
  deepseek: deepseekAdapter,
};

/**
 * Função universal para listar modelos de qualquer provedor
 */
export async function fetchProviderModelsList(
  provider: string,
  apiKey?: string,
  apiUrl?: string,
): Promise<ProviderModelItem[]> {
  const norm = provider.toLowerCase().trim();
  const adapter = providerAdapters[norm];

  if (adapter && adapter.listModels) {
    try {
      const list = await adapter.listModels(apiKey, apiUrl);
      if (list && list.length > 0) return list;
    } catch (err) {
      log.warn(`[Adapters] Erro ao listar modelos do provedor ${provider}:`, (err as Error).message);
      // Continua para o fallback de presets
    }
  }

  // Fallback: Presets populares conhecidos
  const presets = POPULAR_MODELS_PRESETS[norm] || [];
  const results: ProviderModelItem[] = [];
  for (const p of presets) {
    const spec = await resolveModelSpec(p.id);
    results.push({
      ...p,
      contextWindow: spec.contextWindow,
      maxOutputTokens: spec.maxOutputTokens,
      provider: norm,
    });
  }

  return results;
}

/**
 * Função universal para consultar cota/saldo de um provedor
 */
export async function fetchProviderQuota(
  provider: string,
  apiKey?: string,
  apiUrl?: string,
): Promise<ProviderQuotaInfo | null> {
  const norm = provider.toLowerCase().trim();
  const adapter = providerAdapters[norm];
  if (adapter && adapter.getQuota) {
    return adapter.getQuota(apiKey, apiUrl);
  }
  return null;
}

import log from 'electron-log';
import { ModelPricing, ModelSpec, ProviderModelItem } from './types';

// Cache em memória dos modelos públicos do OpenRouter
export interface OpenRouterPublicModel {
  id: string;
  name: string;
  context_length?: number;
  pricing?: {
    prompt?: string;
    completion?: string;
    request?: string;
    image?: string;
  };
  top_provider?: {
    max_completion_tokens?: number;
  };
}

let cachedOpenRouterModels: OpenRouterPublicModel[] | null = null;
let lastOpenRouterFetchTime = 0;
const OPENROUTER_CACHE_TTL = 3600_000; // 1 hora de cache

/**
 * Consulta a lista pública de modelos do OpenRouter (sem necessidade de API Key).
 */
export async function fetchOpenRouterPublicModels(): Promise<OpenRouterPublicModel[]> {
  const now = Date.now();
  if (cachedOpenRouterModels && now - lastOpenRouterFetchTime < OPENROUTER_CACHE_TTL) {
    return cachedOpenRouterModels;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const res = await fetch('https://openrouter.ai/api/v1/models', {
      signal: controller.signal,
      headers: {
        'User-Agent': 'antigravity-byok',
      },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      log.warn(`[ModelSpecs] Falha ao consultar OpenRouter público: ${res.status}`);
      return cachedOpenRouterModels || [];
    }

    const data = (await res.json()) as { data?: OpenRouterPublicModel[] };
    if (data && Array.isArray(data.data)) {
      cachedOpenRouterModels = data.data;
      lastOpenRouterFetchTime = now;
      log.info(`[ModelSpecs] Carregados ${cachedOpenRouterModels.length} modelos públicos do OpenRouter com sucesso.`);
    }
  } catch (err) {
    log.warn('[ModelSpecs] Erro ao buscar catálogo público do OpenRouter:', (err as Error).message);
  }

  return cachedOpenRouterModels || [];
}

/**
 * Normaliza o ID do modelo para comparação flexível.
 * Ex: "openai/gpt-4o" -> "gpt-4o", "meta-llama/llama-3.3-70b-instruct" -> "llama-3.3-70b-instruct"
 */
export function normalizeModelId(id: string): string {
  return id.toLowerCase().replace(/^[a-z0-9_-]+\//, '').trim();
}

/**
 * Permite definir o cache de modelos do OpenRouter em testes unitários.
 */
export function setCachedOpenRouterModelsForTesting(models: OpenRouterPublicModel[] | null): void {
  cachedOpenRouterModels = models;
  lastOpenRouterFetchTime = models ? Date.now() : 0;
}

/**
 * Busca o preço de um modelo no catálogo em memória do OpenRouter (Nível 2 da hierarquia).
 * Os preços da API pública do OpenRouter vêm como USD por token (strings) e são convertidos
 * para USD por 1 Milhão de tokens.
 */
export function findDynamicModelPricing(modelName: string): ModelPricing | null {
  if (!cachedOpenRouterModels || cachedOpenRouterModels.length === 0 || !modelName) {
    return null;
  }

  const cleanId = normalizeModelId(modelName);
  const mLower = modelName.toLowerCase();

  const matched = cachedOpenRouterModels.find((m) => {
    const mIdLower = m.id.toLowerCase();
    return (
      mIdLower === mLower ||
      mIdLower === cleanId ||
      mIdLower.endsWith('/' + cleanId) ||
      normalizeModelId(m.id) === cleanId
    );
  });

  if (
    matched &&
    matched.pricing &&
    (matched.pricing.prompt !== undefined || matched.pricing.completion !== undefined)
  ) {
    const promptStr = matched.pricing.prompt || '0';
    const completionStr = matched.pricing.completion || '0';
    const promptPerToken = parseFloat(promptStr);
    const completionPerToken = parseFloat(completionStr);

    if (!isNaN(promptPerToken) && !isNaN(completionPerToken)) {
      return {
        inputPerMillion: Number((promptPerToken * 1_000_000).toFixed(6)),
        outputPerMillion: Number((completionPerToken * 1_000_000).toFixed(6)),
      };
    }
  }

  return null;
}

/**
 * Resolve as especificações de limites (contextWindow e maxOutputTokens) automaticamente:
 * 1. Usa os limites fornecidos diretamente pelo provedor se existirem.
 * 2. Se o provedor não informar, consulta dinamicamente a base pública do OpenRouter.
 * 3. Se não encontrar na base pública, aplica heurística de segurança conhecida.
 */
export async function resolveModelSpec(
  modelId: string,
  providedContext?: number,
  providedOutput?: number,
): Promise<ModelSpec> {
  // 1. Prioridade: limites fornecidos diretamente pelo provedor
  if (providedContext && providedContext > 0 && providedOutput && providedOutput > 0) {
    return {
      contextWindow: providedContext,
      maxOutputTokens: providedOutput,
    };
  }

  const cleanId = normalizeModelId(modelId);

  // 2. Consulta à base pública do OpenRouter se faltar algum limite
  try {
    const publicModels = await fetchOpenRouterPublicModels();
    const matched = publicModels.find(
      (m) => m.id === modelId || normalizeModelId(m.id) === cleanId || m.id.endsWith(`/${cleanId}`),
    );

    if (matched) {
      const detectedContext = matched.context_length || providedContext;
      const detectedOutput = matched.top_provider?.max_completion_tokens || providedOutput;

      if (detectedContext && detectedContext > 0) {
        return {
          contextWindow: detectedContext,
          maxOutputTokens: detectedOutput && detectedOutput > 0 ? detectedOutput : 8_192,
        };
      }
    }
  } catch (e) {
    log.debug('[ModelSpecs] Falha na resolução dinâmica via OpenRouter:', e);
  }

  // 3. Fallback Heurístico Seguro por Família
  if (cleanId.includes('gemini')) {
    return {
      contextWindow: providedContext || 1_048_576,
      maxOutputTokens: providedOutput || 8_192,
    };
  }

  if (cleanId.includes('claude')) {
    return {
      contextWindow: providedContext || 200_000,
      maxOutputTokens: providedOutput || 8_192,
    };
  }

  if (cleanId.includes('deepseek')) {
    return {
      contextWindow: providedContext || 128_000,
      maxOutputTokens: providedOutput || 8_192,
    };
  }

  if (cleanId.includes('llama') || cleanId.includes('qwen')) {
    return {
      contextWindow: providedContext || 131_072,
      maxOutputTokens: providedOutput || 8_192,
    };
  }

  if (cleanId.includes('gpt-4') || cleanId.includes('o1') || cleanId.includes('o3')) {
    return {
      contextWindow: providedContext || 128_000,
      maxOutputTokens: providedOutput || 16_384,
    };
  }

  // Fallback padrão generoso
  return {
    contextWindow: providedContext || 128_000,
    maxOutputTokens: providedOutput || 4_096,
  };
}

/**
 * Modelos populares pré-definidos por provedor para destaque no topo do modal.
 */
export const POPULAR_MODELS_PRESETS: Record<string, ProviderModelItem[]> = {
  openrouter: [
    { id: 'google/gemini-2.5-flash', name: 'Google: Gemini 2.5 Flash', isPopular: true },
    { id: 'google/gemini-2.5-pro', name: 'Google: Gemini 2.5 Pro', isPopular: true },
    { id: 'anthropic/claude-3.5-sonnet', name: 'Anthropic: Claude 3.5 Sonnet', isPopular: true },
    { id: 'anthropic/claude-3.7-sonnet', name: 'Anthropic: Claude 3.7 Sonnet', isPopular: true },
    { id: 'deepseek/deepseek-chat', name: 'DeepSeek: DeepSeek V3', isPopular: true },
    { id: 'deepseek/deepseek-r1', name: 'DeepSeek: DeepSeek R1', isPopular: true },
    { id: 'openai/gpt-4o', name: 'OpenAI: GPT-4o', isPopular: true },
  ],
  openai: [
    { id: 'gpt-4o', name: 'GPT-4o', isPopular: true },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', isPopular: true },
    { id: 'o1', name: 'o1', isPopular: true },
    { id: 'o3-mini', name: 'o3-mini', isPopular: true },
  ],
  deepseek: [
    { id: 'deepseek-chat', name: 'DeepSeek-V3', isPopular: true },
    { id: 'deepseek-reasoner', name: 'DeepSeek-R1', isPopular: true },
  ],
  ollama: [
    { id: 'llama3.3', name: 'Llama 3.3 (70B)', isPopular: true },
    { id: 'deepseek-r1:7b', name: 'DeepSeek R1 (7B)', isPopular: true },
    { id: 'qwen2.5-coder:7b', name: 'Qwen 2.5 Coder (7B)', isPopular: true },
  ],
};

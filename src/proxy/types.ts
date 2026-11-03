/**
 * Unified Provider and Model Capability Types.
 */

export interface ModelSpec {
  contextWindow: number;     // maxTokens (ex: 1_048_576)
  maxOutputTokens: number;   // maxOutputTokens (ex: 8_192)
  supportsThinking?: boolean;
  supportsImages?: boolean;
}

export interface ProviderModelItem {
  id: string;               // Identificador do modelo na API (ex: "google/gemini-2.5-flash")
  name: string;             // Nome amigável de exibição
  contextWindow?: number;   // Context Window detectado
  maxOutputTokens?: number; // Max Output Tokens detectado
  isPopular?: boolean;      // Destaque de popularidade
  description?: string;
  provider?: string;
}

export interface ProviderQuotaInfo {
  providerId: string;
  providerName: string;
  balanceUsd?: number;
  usageUsd?: number;
  limitUsd?: number;
  rateLimitPerMinute?: number;
  remainingFraction?: number; // 0.0 a 1.0 (para barras de progresso da IDE)
  refreshText?: string;       // Ex: "$14.20 restantes"
}

export interface IProviderAdapter {
  id: string;
  displayName: string;
  defaultBaseUrl: string;
  listModels?(apiKey?: string, apiUrl?: string): Promise<ProviderModelItem[]>;
  getQuota?(apiKey?: string, apiUrl?: string): Promise<ProviderQuotaInfo | null>;
}

export interface ProviderMetadata {
  id: string;
  displayName: string;
  defaultBaseUrl: string;
  isLocal: boolean;
}

export interface ProviderHeaders {
  'Content-Type': string;
  Authorization?: string;
  'x-api-key'?: string;
  'anthropic-version'?: string;
  'anthropic-beta'?: string;
  'x-goog-api-key'?: string;
  'HTTP-Referer'?: string;
  'X-Title'?: string;
  [key: string]: string | undefined;
}

export interface ModelTokenConfig {
  maxTokens?: number;
  maxOutputTokens?: number;
  workingContextBudget?: number;
}

// ─── Gemini Wire Protocol Types ──────────────────────────────────────────

export interface GeminiPart {
  text?: string;
  thought?: boolean;
  functionCall?: {
    name: string;
    args: Record<string, unknown>;
    id?: string;
  };
  functionResponse?: {
    name: string;
    response: unknown;
    id?: string;
  };
  fileData?: { mimeType: string; fileUri: string };
  inlineData?: { mimeType: string; data: string };
}

export interface GeminiContent {
  role?: string;
  parts?: GeminiPart[];
}

export interface GeminiTool {
  functionDeclarations?: Array<{
    name: string;
    description?: string;
    parameters?: {
      type: string;
      properties?: Record<string, unknown>;
    };
  }>;
}

export interface GeminiRequestBody {
  systemInstruction?: { parts: GeminiPart[] };
  contents?: GeminiContent[];
  tools?: GeminiTool[];
  generationConfig?: {
    temperature?: number;
    maxOutputTokens?: number;
    topP?: number;
    topK?: number;
  };
}

export interface ProviderConstructor<T = unknown> {
  new (): T;
  readonly id: string;
  readonly displayName: string;
  readonly defaultBaseUrl: string;
  readonly isLocal?: boolean;
}

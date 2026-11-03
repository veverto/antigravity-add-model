/**
 * BaseProvider: Classe Abstrata Fundamental de Provedores de IA.
 *
 * Implementa o Template Method Pattern para o ciclo de vida de requisições:
 * 1. Poda universal de histórico (pruneHistory) preservando 100% do turno ativo
 *    e compactando saídas volumosas de ferramentas antigas em breadcrumbs.
 * 2. Gestão polimórfica de cotas (getQuota), garantindo cota infinita para modelos locais.
 * 3. Delegação da serialização de payloads para as subclasses concretas.
 */

import {
  GeminiRequestBody,
  GeminiContent,
  ModelTokenConfig,
  ProviderHeaders,
  ProviderQuotaInfo,
} from '../types';

export abstract class BaseProvider {
  // Metadados estáticos do provedor
  static readonly id: string = 'base';
  static readonly displayName: string = 'Base Provider';
  static readonly defaultBaseUrl: string = '';
  static readonly isLocal: boolean = false;

  // Getters de instância vinculados ao construtor
  get id(): string {
    return (this.constructor as typeof BaseProvider).id;
  }

  get displayName(): string {
    return (this.constructor as typeof BaseProvider).displayName;
  }

  get defaultBaseUrl(): string {
    return (this.constructor as typeof BaseProvider).defaultBaseUrl;
  }

  get isLocal(): boolean {
    return (this.constructor as typeof BaseProvider).isLocal ?? false;
  }

  /**
   * Consulta cota e saldo do provedor.
   * Modelos locais (Ollama, LM Studio) retornam cota infinita por padrão.
   */
  async getQuota(_apiKey?: string, _apiUrl?: string): Promise<ProviderQuotaInfo | null> {
    if (this.isLocal) {
      return {
        providerId: this.id,
        providerName: this.displayName,
        remainingFraction: 1.0,
        refreshText: 'Ilimitado (Execução Local)',
      };
    }
    return null;
  }

  /**
   * Indica se o provedor suporta streaming Server-Sent Events (SSE).
   */
  supportsStreaming(): boolean {
    return true;
  }

  /**
   * Poda Universal de Contexto (pruneHistory):
   * - Identifica onde começa o Turno Ativo (última mensagem de usuário humano).
   * - Mantém 100% dos dados no Turno Ativo (ferramentas e leituras recém-executadas).
   * - Em turnos anteriores, substitui saídas volumosas de ferramentas (>500 chars)
   *   por um marcador/breadcrumb enxuto, preservando prompts de usuário e respostas do modelo.
   */
  pruneHistory(contents?: GeminiContent[], _tokenConfig?: ModelTokenConfig): GeminiContent[] {
    if (!contents || contents.length === 0) {
      return [];
    }

    // Localiza o início do Turno Ativo (última mensagem de usuário humano que não seja resposta de tool)
    let lastUserPromptIdx = -1;
    for (let i = contents.length - 1; i >= 0; i--) {
      const item = contents[i];
      const isToolResponse = item.parts?.some((p) => p.functionResponse);
      const isUserRole = item.role === 'user' || !item.role;
      if (isUserRole && !isToolResponse) {
        lastUserPromptIdx = i;
        break;
      }
    }

    // Se não encontrou mensagem de usuário, considera apenas o último item como ativo
    const activeStartIdx = lastUserPromptIdx !== -1 ? lastUserPromptIdx : contents.length - 1;

    return contents.map((item, idx) => {
      // Se pertence ao turno ativo, retorna intocado (fidelidade 100%)
      if (idx >= activeStartIdx) {
        return item;
      }

      // Se for turno anterior, verifica se possui partes de ferramentas para podar
      if (!item.parts || item.parts.length === 0) {
        return item;
      }

      const hasToolResponse = item.parts.some((p) => p.functionResponse);
      if (!hasToolResponse) {
        return item;
      }

      const newParts = item.parts.map((p) => {
        if (!p.functionResponse) return p;

        const funcName = p.functionResponse.name || 'ferramenta';
        const rawResponse = p.functionResponse.response;
        const strResponse =
          typeof rawResponse === 'string'
            ? rawResponse
            : JSON.stringify(rawResponse ?? {});

        // Só poda saídas volumosas (>500 caracteres)
        if (strResponse.length > 500) {
          return {
            ...p,
            functionResponse: {
              ...p.functionResponse,
              response: `[${funcName}: Conteúdo omitido do histórico para otimização de contexto (${Math.round(strResponse.length / 4)} tokens). Se precisar consultar trechos específicos, utilize a ferramenta correspondente novamente.]`,
            },
          };
        }

        return p;
      });

      return {
        ...item,
        parts: newParts,
      };
    });
  }

  /**
   * Template Method para tradução da requisição.
   * Executa a poda de histórico antes de delegar para o formatPayload específico da subclasse.
   */
  translateRequest(
    geminiBody: GeminiRequestBody,
    modelName: string,
    effort?: string,
    tokenConfig?: ModelTokenConfig,
  ): unknown {
    const prunedContents = this.pruneHistory(geminiBody.contents, tokenConfig);
    const bodyWithPrunedHistory: GeminiRequestBody = {
      ...geminiBody,
      contents: prunedContents,
    };
    return this.formatPayload(bodyWithPrunedHistory, modelName, effort, tokenConfig);
  }

  // ── Métodos Abstratos a serem implementados pelas subclasses ─────────────

  abstract formatPayload(
    geminiBody: GeminiRequestBody,
    modelName: string,
    effort?: string,
    tokenConfig?: ModelTokenConfig,
  ): unknown;

  abstract translateResponse(providerRes: unknown, modelName: string): unknown;

  abstract translateStreamChunk(chunk: unknown, modelName: string): unknown | null;

  abstract getHeaders(apiKey?: string): ProviderHeaders;

  abstract getUrl(baseUrl: string, modelName: string, isStream: boolean): string;
}

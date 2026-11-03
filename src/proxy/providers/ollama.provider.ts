/**
 * OllamaProvider: Especialização do OpenAIProvider para Ollama (Local).
 *
 * Configura:
 * - isLocal = true (cota ilimitada herdada automaticamente da BaseProvider).
 * - Normalização de URLs para o endpoint padrão do Ollama (localhost:11434).
 */

import { OpenAIProvider } from './openai.provider';
import { getOllamaApiUrl } from '../translators/ollama';

export class OllamaProvider extends OpenAIProvider {
  static override readonly id: string = 'ollama';
  static override readonly displayName: string = 'Ollama (Local)';
  static override readonly defaultBaseUrl: string = 'http://localhost:11434';
  static override readonly isLocal: boolean = true;

  override getUrl(baseUrl: string, _modelName: string, _isStream: boolean): string {
    return getOllamaApiUrl(baseUrl || this.defaultBaseUrl);
  }
}

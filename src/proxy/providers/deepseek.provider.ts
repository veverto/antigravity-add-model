/**
 * DeepSeekProvider: Especialização do OpenAIProvider para a API do DeepSeek.
 */

import { OpenAIProvider } from './openai.provider';

export class DeepSeekProvider extends OpenAIProvider {
  static override readonly id: string = 'deepseek';
  static override readonly displayName: string = 'DeepSeek';
  static override readonly defaultBaseUrl: string = 'https://api.deepseek.com';
  static override readonly isLocal: boolean = false;
}

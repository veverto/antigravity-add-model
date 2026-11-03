/**
 * GroqProvider: Especialização do OpenAIProvider para inferência ultrarrápida da Groq.
 */

import { OpenAIProvider } from './openai.provider';

export class GroqProvider extends OpenAIProvider {
  static override readonly id: string = 'groq';
  static override readonly displayName: string = 'Groq';
  static override readonly defaultBaseUrl: string = 'https://api.groq.com/openai/v1';
  static override readonly isLocal: boolean = false;
}

export class MistralProvider extends OpenAIProvider {
  static override readonly id = 'mistral';
  static override readonly displayName = 'Mistral';
  static override readonly defaultBaseUrl: string = 'https://api.mistral.ai/v1';
  static override readonly isLocal: boolean = false;
}

export class CerebrasProvider extends OpenAIProvider {
  static override readonly id = 'cerebras';
  static override readonly displayName = 'Cerebras';
  static override readonly defaultBaseUrl: string = 'https://api.cerebras.ai/v1';
  static override readonly isLocal: boolean = false;
}

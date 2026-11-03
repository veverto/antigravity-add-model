/**
 * Catálogo Declarativo Central de Provedores.
 *
 * Registra formalmente as classes concretas de cada provedor, eliminando
 * a necessidade de varredura em disco via fs.readdirSync.
 */

import { ProviderConstructor } from '../types';
import { BaseProvider } from './base.provider';
import { OpenAIProvider } from './openai.provider';
import { OpenRouterProvider } from './openrouter.provider';
import { OllamaProvider } from './ollama.provider';
import { DeepSeekProvider } from './deepseek.provider';
import { AnthropicProvider } from './anthropic.provider';
import { GoogleProvider } from './google.provider';
import {
  GroqProvider,
  MistralProvider,
  CerebrasProvider,
} from './lightweight.providers';

export {
  BaseProvider,
  OpenAIProvider,
  OpenRouterProvider,
  OllamaProvider,
  DeepSeekProvider,
  AnthropicProvider,
  GoogleProvider,
  GroqProvider,
  MistralProvider,
  CerebrasProvider,
};

export const REGISTERED_PROVIDERS: ProviderConstructor<BaseProvider>[] = [
  OpenRouterProvider,
  DeepSeekProvider,
  OpenAIProvider,
  OllamaProvider,
  AnthropicProvider,
  GoogleProvider,
  GroqProvider,
  MistralProvider,
  CerebrasProvider,
];

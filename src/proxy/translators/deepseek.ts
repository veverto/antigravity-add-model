/**
 * DeepSeek Provider Translator.
 * Supports OpenAI-compatible reasoning endpoint with reasoning_content support,
 * and Anthropic fallback.
 */
export { mapGeminiToOpenAI, mapOpenAIToGemini, mapOpenAIChunkToGemini } from './openai';
export { mapGeminiToAnthropic, mapAnthropicToGemini, mapAnthropicChunkToGemini } from './anthropic';

/**
 * OpenAI/Ollama provider translator.
 * Handles Gemini ↔ OpenAI/Ollama request/response mapping and streaming chunks.
 */
import * as path from 'path';

import log from 'electron-log';
import {
  fixParamTypes,
  translateToolCallToNative,
  formatTranslatedResponse,
  normalizeToolArgs,
  ToolCallArgs,
  TranslatedCallInfo,
} from './utils';
import {
  modelToolCallIds,
  modelReasoningContent,
  activeStreamContexts,
  translatedToolCalls,
  stateTimestamps,
  touchStateTimestamp,
  StreamContext,
} from '../shared';

// ─── Types ────────────────────────────────────────────────────────────────

interface GeminiTool {
  functionDeclarations?: GeminiFunctionDeclaration[];
}

interface GeminiFunctionDeclaration {
  name: string;
  description?: string;
  parameters?: GeminiParameters;
}

interface GeminiParameters {
  type: string;
  properties?: Record<string, unknown>;
}

interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface GeminiContent {
  role?: string;
  parts?: GeminiPart[];
}

interface GeminiPart {
  text?: string;
  thought?: boolean;
  functionCall?: GeminiFunctionCall;
  functionResponse?: GeminiFunctionResponse;
  fileData?: { mimeType: string; fileUri: string };
  inlineData?: { mimeType: string; data: string };
}

interface GeminiFunctionCall {
  name: string;
  args: Record<string, unknown>;
  id?: string;
}

interface GeminiFunctionResponse {
  name: string;
  response: unknown;
  id?: string;
}

interface GeminiRequestBody {
  systemInstruction?: { parts: GeminiPart[] };
  contents?: GeminiContent[];
  tools?: GeminiTool[];
  generationConfig?: {
    temperature?: number;
    maxOutputTokens?: number;
  };
}

interface OpenAIMessage {
  role: string;
  content:
    | string
    | null
    | Array<{
        type: string;
        text?: string;
        cache_control?: { type: string };
        [key: string]: unknown;
      }>;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
  reasoning_content?: string;
  cache_control?: { type: string };
}

interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface OpenAIRequestBody {
  model: string;
  messages: OpenAIMessage[];
  temperature?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  reasoning_effort?: 'low' | 'medium' | 'high';
  include_reasoning?: boolean;
  reasoning?: {
    effort?: string;
    max_tokens?: number;
    exclude?: boolean;
  };
  tools?: OpenAITool[];
  stream?: boolean;
}

interface OpenAIResponse {
  choices?: OpenAIChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OpenAIChoice {
  message?: {
    content: string;
    reasoning_content?: string;
    reasoning?: string;
    tool_calls?: OpenAIToolCall[];
  };
  finish_reason?: string;
  delta?: {
    content?: string;
    reasoning_content?: string;
    reasoning?: string;
    tool_calls?: OpenAIToolCallDelta[];
  };
}

interface OpenAIToolCallDelta {
  index?: number;
  id?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

interface GeminiGenerateContentResponse {
  candidates: GeminiCandidate[];
  usageMetadata?: GeminiUsageMetadata;
}

interface GeminiCandidate {
  content: {
    parts: GeminiPart[];
    role: string;
  };
  finishReason: string;
  index: number;
}

interface GeminiUsageMetadata {
  promptTokenCount: number;
  candidatesTokenCount: number;
  totalTokenCount: number;
}

interface DSMLParsedResult {
  functionCalls: { name: string; args: Record<string, unknown> }[];
  cleanText: string;
}

// ─── REQUEST: Gemini → OpenAI ──────────────────────────────────────────────

function cleanDescription(desc?: string): string {
  if (!desc) return '';
  // Normalize whitespace while preserving essential guidelines, constraints, and instructions
  const trimmed = desc.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (trimmed.length <= 2500) return trimmed;
  return trimmed.slice(0, 2500).trim();
}

function normalizeProperties(props: Record<string, unknown>): void {
  for (const [, prop] of Object.entries(props)) {
    if (prop && typeof prop === 'object') {
      const p = prop as Record<string, unknown>;
      if (typeof p.description === 'string') {
        p.description = p.description.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
      }
      if (p.properties && typeof p.properties === 'object') {
        normalizeProperties(p.properties as Record<string, unknown>);
      }
      if (p.items && typeof p.items === 'object') {
        const items = p.items as Record<string, unknown>;
        if (typeof items.description === 'string') {
          items.description = items.description.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
        }
        if (items.properties && typeof items.properties === 'object') {
          normalizeProperties(items.properties as Record<string, unknown>);
        }
      }
    }
  }
}

function mapGeminiToolsToOpenAI(geminiTools: GeminiTool[]): OpenAITool[] {
  if (!geminiTools || !Array.isArray(geminiTools)) return [];
  const openaiTools: OpenAITool[] = [];
  for (const toolGroup of geminiTools) {
    if (toolGroup.functionDeclarations && Array.isArray(toolGroup.functionDeclarations)) {
      for (const func of toolGroup.functionDeclarations) {
        const params = func.parameters
          ? (JSON.parse(JSON.stringify(func.parameters)) as Record<string, unknown>)
          : { type: 'object', properties: {} };
        if (params.type && typeof params.type === 'string') {
          (params as Record<string, string>).type = (params.type as string).toLowerCase();
        }
        if (params.properties) {
          fixParamTypes(params.properties as Record<string, unknown>);
          normalizeProperties(params.properties as Record<string, unknown>);
        }
        openaiTools.push({
          type: 'function',
          function: {
            name: func.name,
            description: cleanDescription(func.description),
            parameters: params,
          },
        });
      }
    }
  }
  return openaiTools;
}

/**
 * Prunes non-essential tutorial sections and boilerplate while preserving:
 * - <identity>
 * - <user_information>
 * - <user_rules> (MANDATORY permission rules)
 * - <customizations> (Customization roots & discovery)
 * - <skills> (Available skills list)
 * - <guidelines> and <communication_style>
 * - <artifacts> path (retaining the Artifact Directory Path while stripping verbose layout guide)
 */
export function cleanSystemInstruction(text: string): string {
  if (!text) return '';
  let cleaned = text;
  cleaned = cleaned.replace(/<web_application_development>[\s\S]*?<\/web_application_development>/gi, '');
  cleaned = cleaned.replace(/<conversation_transcript>[\s\S]*?<\/conversation_transcript>/gi, '');
  cleaned = cleaned.replace(/<knowledge_items>[\s\S]*?<\/knowledge_items>/gi, '');
  cleaned = cleaned.replace(/<messaging>[\s\S]*?<\/messaging>/gi, '');
  cleaned = cleaned.replace(/<slash_commands>[\s\S]*?<\/slash_commands>/gi, '');

  const artifactDirMatch = text.match(/Artifact Directory Path:\s*([^\s\n\r]+)/i);
  const artifactDirPath = artifactDirMatch ? artifactDirMatch[1] : '';
  cleaned = cleaned.replace(
    /<artifacts>[\s\S]*?<\/artifacts>/gi,
    artifactDirPath ? `<artifacts>\nArtifact Directory Path: ${artifactDirPath}\n</artifacts>` : '',
  );

  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();
  return cleaned;
}

/**
 * Estimates token count for a string or message payload.
 * Standard ~4 chars/token approximation.
 */
export function estimateTokenCount(str: string): number {
  return Math.ceil((str || '').length / 4);
}

export function estimateMessageTokens(msg: OpenAIMessage): number {
  if (!msg) return 0;
  let tokens = 4;
  if (typeof msg.content === 'string') {
    tokens += estimateTokenCount(msg.content);
  } else if (Array.isArray(msg.content)) {
    for (const part of msg.content) {
      if (typeof part.text === 'string') {
        tokens += estimateTokenCount(part.text);
      }
    }
  }
  if (msg.tool_calls) {
    for (const tc of msg.tool_calls) {
      tokens += estimateTokenCount(tc.function.name) + estimateTokenCount(tc.function.arguments);
    }
  }
  return tokens;
}

export const DEFAULT_WORKING_CONTEXT_BUDGET = 40_000;

/**
 * Universal token-budgeted conversation pruning.
 * - If maxContextOrRecentMessages < 1000: runs legacy sliding-window message count (backwards compatibility for tests).
 * - Otherwise: operates purely on token budgets derived from the working context budget (default 40k tokens).
 *   - Zero Pruning Rule: If total tokens <= availableBudget, preserves 100% of history intact.
 *   - Soft compression / Tombstoning: Truncates older tool outputs (>400 chars) to 300 chars to avoid token burn.
 *   - Safe sliding window: Drops older intermediate turns while strictly protecting the system prompt,
 *     the initial user request (project goal), and the active user turn.
 */
export function pruneChatMessages(
  messages: OpenAIMessage[],
  maxContextOrRecentMessages = DEFAULT_WORKING_CONTEXT_BUDGET,
  maxOutputTokens = 8_192,
): OpenAIMessage[] {
  // Backwards compatibility for tests passing message counts (e.g. 4, 10, 25)
  if (maxContextOrRecentMessages < 1000) {
    return pruneChatMessagesLegacy(messages, maxContextOrRecentMessages);
  }

  const systemMsg = messages.find((m) => m.role === 'system');
  const nonSystemMsgs = messages.filter((m) => m.role !== 'system');

  if (nonSystemMsgs.length === 0) {
    return messages;
  }

  const outputReserve = Math.min(Math.max(4_000, maxOutputTokens), 16_384);
  const availableBudget = Math.max(8_000, maxContextOrRecentMessages - outputReserve);

  // 1. Identify active turn: starts at the latest user message
  let lastUserIdx = -1;
  for (let i = nonSystemMsgs.length - 1; i >= 0; i--) {
    if (nonSystemMsgs[i].role === 'user') {
      lastUserIdx = i;
      break;
    }
  }

  const activeTurnMsgs = lastUserIdx !== -1 ? nonSystemMsgs.slice(lastUserIdx) : [nonSystemMsgs[nonSystemMsgs.length - 1]];
  const olderMsgs = lastUserIdx !== -1 ? nonSystemMsgs.slice(0, lastUserIdx) : nonSystemMsgs.slice(0, -1);

  // 2. Tombstoning / Soft compression: trunca saídas de ferramentas em turnos anteriores a 300 chars
  for (const m of olderMsgs) {
    if (m.role === 'tool' && typeof m.content === 'string' && m.content.length > 400) {
      const origLen = m.content.length;
      m.content = m.content.slice(0, 300) + `\n... [Older tool output truncated: ${origLen} chars to preserve context budget]`;
    }
  }

  // Se o próprio turno ativo for excessivamente longo (> 20 mensagens), trunca ferramentas mais antigas dele
  if (activeTurnMsgs.length > 20) {
    const recentActiveStart = Math.max(1, activeTurnMsgs.length - 15);
    for (let i = 1; i < recentActiveStart; i++) {
      const m = activeTurnMsgs[i];
      if (m.role === 'tool' && typeof m.content === 'string' && m.content.length > 500) {
        m.content = m.content.slice(0, 300) + '\n... [Intermediate tool output condensed]';
      }
    }
  }

  let totalTokens =
    (systemMsg ? estimateMessageTokens(systemMsg) : 0) +
    olderMsgs.reduce((acc, m) => acc + estimateMessageTokens(m), 0) +
    activeTurnMsgs.reduce((acc, m) => acc + estimateMessageTokens(m), 0);

  // 3. REGRA ZERO PODA: Se cabe no orçamento de trabalho, retorna tudo intacto!
  if (totalTokens <= availableBudget) {
    const res: OpenAIMessage[] = [];
    if (systemMsg) res.push(systemMsg);
    res.push(...olderMsgs, ...activeTurnMsgs);
    return res;
  }

  // 4. Se ainda ultrapassar, descarta turnos intermediários antigos mantendo o primeiro user e o turno ativo
  const firstUserMsg = olderMsgs.find((m) => m.role === 'user') || olderMsgs[0];
  const prunedOlder: OpenAIMessage[] = [];

  const activeTokens = activeTurnMsgs.reduce((acc, m) => acc + estimateMessageTokens(m), 0);
  const systemTokens = systemMsg ? estimateMessageTokens(systemMsg) : 0;
  const firstUserTokens = firstUserMsg ? estimateMessageTokens(firstUserMsg) : 0;
  const remainingBudgetForOlder = availableBudget - activeTokens - systemTokens - firstUserTokens;

  if (remainingBudgetForOlder > 0 && olderMsgs.length > 0) {
    let accumulated = 0;
    let startIdx = olderMsgs.length;
    for (let i = olderMsgs.length - 1; i >= 0; i--) {
      const msgTokens = estimateMessageTokens(olderMsgs[i]);
      if (accumulated + msgTokens > remainingBudgetForOlder) break;
      accumulated += msgTokens;
      startIdx = i;
    }
    // Ensure we don't start on an orphaned tool response
    while (startIdx < olderMsgs.length && olderMsgs[startIdx].role === 'tool') {
      startIdx++;
    }
    prunedOlder.push(...olderMsgs.slice(startIdx));
  }

  const pruned: OpenAIMessage[] = [];
  if (systemMsg) pruned.push(systemMsg);
  if (firstUserMsg && !prunedOlder.includes(firstUserMsg)) {
    pruned.push(firstUserMsg);
    pruned.push({
      role: 'user',
      content:
        '[Note: Earlier intermediate conversation turns have been condensed. The current active request and task are defined in the recent messages below.]',
    });
  }
  pruned.push(...prunedOlder, ...activeTurnMsgs);
  return pruned;
}

export interface ModelTokenConfig {
  maxTokens?: number;
  maxOutputTokens?: number;
  workingContextBudget?: number;
}

function pruneChatMessagesLegacy(messages: OpenAIMessage[], maxRecentMessages: number): OpenAIMessage[] {
  const systemMsg = messages.find((m) => m.role === 'system');
  const nonSystemMsgs = messages.filter((m) => m.role !== 'system');

  // Truncate gigantic tool outputs in history to 2,500 characters
  for (const m of nonSystemMsgs) {
    if (m.role === 'tool' && typeof m.content === 'string' && m.content.length > 2500) {
      m.content = m.content.slice(0, 2500) + '\n... [Remaining output truncated for token optimization]';
    }
  }

  if (nonSystemMsgs.length <= maxRecentMessages) {
    return messages;
  }

  // Preserve the first user message (original intent/goal)
  const firstUserMsg = nonSystemMsgs.find((m) => m.role === 'user') || nonSystemMsgs[0];

  // Identify the active turn: starts at the latest user message
  let lastUserIdx = -1;
  for (let i = nonSystemMsgs.length - 1; i >= 0; i--) {
    if (nonSystemMsgs[i].role === 'user') {
      lastUserIdx = i;
      break;
    }
  }

  let activeTurnMsgs = lastUserIdx !== -1 ? nonSystemMsgs.slice(lastUserIdx) : [nonSystemMsgs[nonSystemMsgs.length - 1]];
  const olderMsgs = lastUserIdx !== -1 ? nonSystemMsgs.slice(0, lastUserIdx) : nonSystemMsgs.slice(0, -1);

  // If the active turn itself is enormous (> 60 messages), keep the active user prompt and the most recent tool interactions
  if (activeTurnMsgs.length > 60) {
    const activeUserPrompt = activeTurnMsgs[0];
    let recentActiveStart = activeTurnMsgs.length - 50;
    while (recentActiveStart > 1 && activeTurnMsgs[recentActiveStart].role === 'tool') {
      recentActiveStart--;
    }
    activeTurnMsgs = [
      activeUserPrompt,
      {
        role: 'user',
        content: '[Note: Earlier intermediate tool calls in this turn were omitted to stay within token limits.]',
      },
      ...activeTurnMsgs.slice(recentActiveStart),
    ];
  }

  let recentOlderMsgs: OpenAIMessage[] = [];
  const remainingBudget = maxRecentMessages - activeTurnMsgs.length;

  if (remainingBudget > 0 && olderMsgs.length > 0) {
    let olderStartIndex = Math.max(0, olderMsgs.length - remainingBudget);
    while (olderStartIndex > 0 && olderMsgs[olderStartIndex].role === 'tool') {
      olderStartIndex--;
    }
    recentOlderMsgs = olderMsgs.slice(olderStartIndex);
  }

  const pruned: OpenAIMessage[] = [];
  if (systemMsg) pruned.push(systemMsg);

  const combinedRecent = [...recentOlderMsgs, ...activeTurnMsgs];
  if (!combinedRecent.includes(firstUserMsg)) {
    pruned.push(firstUserMsg);
    pruned.push({
      role: 'user',
      content: '[Note: Earlier intermediate conversation turns have been condensed to preserve context budget.]',
    });
  }

  pruned.push(...combinedRecent);
  return pruned;
}

export function mapGeminiToOpenAI(
  geminiBody: GeminiRequestBody,
  modelName: string,
  effort?: string,
  tokenConfig?: ModelTokenConfig,
): OpenAIRequestBody {
  const messages: OpenAIMessage[] = [];

  if (geminiBody.systemInstruction && geminiBody.systemInstruction.parts) {
    const rawSystemText = geminiBody.systemInstruction.parts.map((p) => p.text || '').join('');
    const baseSystemText = cleanSystemInstruction(rawSystemText);
    const systemText = baseSystemText
      ? baseSystemText +
        '\n\n<execution_guidelines>\n- When the user sends an approval or confirmation (e.g. "Pode aplicar", "Pode alterar", "prossiga", "aplique"), focus directly on executing the plan, proposal, or file modifications agreed upon in the immediately preceding messages of this active topic.\n- Do not re-evaluate or reopen completed historical tasks from earlier in the conversation.\n- Prefer direct structured tools (read_file, edit_file, write_file) rather than running shell commands (like cat, sed, awk) to inspect or modify code.\n</execution_guidelines>'
      : '';
    if (systemText) {
      const isCacheSupported = /openrouter|anthropic|claude|gemini|deepseek|qwen/i.test(modelName);
      if (isCacheSupported) {
        messages.push({
          role: 'system',
          content: [
            {
              type: 'text',
              text: systemText,
              cache_control: { type: 'ephemeral' },
            },
          ],
        });
      } else {
        messages.push({
          role: 'system',
          content: systemText,
        });
      }
    }
  }

  if (geminiBody.contents) {
    let callSeq = 0;
    const pendingCallsByName = new Map<string, string[]>();

    for (let itemIdx = 0; itemIdx < geminiBody.contents.length; itemIdx++) {
      const item = geminiBody.contents[itemIdx];
      if (!item.parts) continue;

      const hasFunctionCall = item.parts.some((p) => p.functionCall);
      const hasFunctionResponse = item.parts.some((p) => p.functionResponse);

      if (hasFunctionCall && item.role === 'model') {
        const toolCalls: OpenAIToolCall[] = [];
        const nextItem = geminiBody.contents[itemIdx + 1];
        const nextResponses = nextItem && nextItem.parts
          ? nextItem.parts.filter((p) => p.functionResponse).map((p) => p.functionResponse!)
          : [];

        for (const p of item.parts) {
          if (p.functionCall) {
            callSeq++;
            const funcName = p.functionCall.name;
            const matchingNextResp = nextResponses.find((r) => r.name === funcName && r.id);
            const callId = p.functionCall.id || matchingNextResp?.id || `call_${callSeq}_${funcName}`;

            let originalName = p.functionCall.name;
            let originalArgs = p.functionCall.args;
            const translatedInfo = translatedToolCalls.get(callId);
            if (translatedInfo) {
              originalName = translatedInfo.originalName;
              originalArgs = { CommandLine: translatedInfo.cmd, Cwd: translatedInfo.cwd };
            }

            toolCalls.push({
              id: callId,
              type: 'function',
              function: {
                name: originalName,
                arguments: typeof originalArgs === 'string' ? originalArgs : JSON.stringify(originalArgs || {}),
              },
            });

            if (!pendingCallsByName.has(funcName)) {
              pendingCallsByName.set(funcName, []);
            }
            pendingCallsByName.get(funcName)!.push(callId);
          }
        }
        messages.push({ role: 'assistant', content: null, tool_calls: toolCalls });
      } else if (hasFunctionResponse) {
        for (const p of item.parts) {
          if (p.functionResponse) {
            const funcName = p.functionResponse.name || '';
            const pendingList = pendingCallsByName.get(funcName);
            const matchedId = pendingList && pendingList.length > 0 ? pendingList.shift() : undefined;
            const modelTCIds = modelToolCallIds.get(modelName) || {};
            const toolCallId = p.functionResponse.id || matchedId || modelTCIds[funcName] || `call_${funcName}`;
            const responseData = p.functionResponse.response;
            let contentStr = '';
            const translatedInfo = translatedToolCalls.get(toolCallId);
            if (translatedInfo) {
              contentStr = formatTranslatedResponse(translatedInfo, responseData);
            } else {
              contentStr = typeof responseData === 'string' ? responseData : JSON.stringify(responseData || {});
            }
            messages.push({ role: 'tool', content: contentStr, tool_call_id: toolCallId });
          }
        }
      } else {
        const role = item.role === 'model' ? 'assistant' : item.role || 'user';
        let content = '';
        let reasoning_content = '';
        if (role === 'assistant') {
          const regularParts = (item.parts || []).filter((p) => !p.thought);
          const thoughtParts = (item.parts || []).filter((p) => p.thought);
          content = regularParts.map((p) => p.text || '').join('');
          reasoning_content = thoughtParts.map((p) => p.text || '').join('');
        } else {
          const parts = item.parts || [];
          const partsContent: string[] = [];
          for (const p of parts) {
            if (p.text) {
              partsContent.push(p.text);
            } else if (p.fileData) {
              const fd = p.fileData as { mimeType: string; fileUri: string };
              // Try to read local files directly
              try {
                const url = new URL(fd.fileUri);
                if (url.protocol === 'file:') {
                  const fs = require('fs');
                  const fileContent = fs.readFileSync(url.pathname.replace(/^\//, '').replace(/\//g, path.sep), 'utf-8');
                  partsContent.push(`[File content from ${fd.fileUri}]:\n${fileContent}`);
                } else {
                  partsContent.push(`[File reference: ${fd.fileUri} (${fd.mimeType})]`);
                }
              } catch {
                partsContent.push(`[File reference: ${fd.fileUri} (${fd.mimeType})]`);
              }
            } else if (p.inlineData) {
              const id = p.inlineData as { mimeType: string; data: string };
              if (id.mimeType && id.mimeType.startsWith('image/')) {
                partsContent.push(`[Image: data:${id.mimeType};base64,${id.data}]`);
              } else {
                partsContent.push(`[Inline data: ${id.mimeType}, length: ${(id.data || '').length} chars]`);
              }
            }
          }
          content = partsContent.join('\n');
        }
        const msg: OpenAIMessage = { role, content };
        if (reasoning_content) msg.reasoning_content = reasoning_content;
        messages.push(msg);
      }
    }
  }

  // Inject reasoning_content into assistant messages missing it
  let lastAssistantIdx = -1;
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === 'assistant') lastAssistantIdx = i;
  }
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === 'assistant' && !(messages[i] as OpenAIMessage).reasoning_content) {
      const preservedReasoning = modelReasoningContent.get(modelName) || '';
      messages[i].reasoning_content = i === lastAssistantIdx && preservedReasoning ? preservedReasoning : '';
    }
  }

  // Models requiring max_completion_tokens instead of max_tokens:
  // - Legacy o-series: o1, o3, o4-mini (any format: o1, o1-mini, openai/o3, etc.)
  // - Legacy gpt-4.1 series: gpt-4.1, 4.1-mini, gpt-4.1-nano (any prefix)
  // - GPT-5.x thinking/pro: gpt-5.4-thinking, gpt-5.5-pro, etc.
  //   (OpenAI unified under GPT-5.x in Feb 2026, deprecated all previous models)
  const lowerName = modelName.toLowerCase();
  const isThinkingModel = /thinking|reasoning/i.test(lowerName);
  const isReasoningModel = /(^|\/|^openai\/)(o1|o3|o4)(-|$|mini|pro)/i.test(lowerName);
  const is41Model = /(^|\/|^openai\/)(gpt-)?4\.1(-|mini|nano)/i.test(lowerName);
  const is5Pro = /(^|\/|^openai\/)(gpt-)?5\.5-pro/i.test(lowerName);
  const is5Thinking = /(^|\/|^openai\/)(gpt-)?5\.4/i.test(lowerName);
  const needsCompletionTokens = isThinkingModel || isReasoningModel || is41Model || is5Pro || is5Thinking;
  const needsNoTemperature = isThinkingModel || isReasoningModel;

  const maxTokens = Math.min(
    geminiBody.generationConfig?.maxOutputTokens ?? tokenConfig?.maxOutputTokens ?? 4000,
    16384,
  );
  const modelMaxTokens = tokenConfig?.maxTokens && tokenConfig.maxTokens > 0 ? tokenConfig.maxTokens : 128_000;
  const workingBudget = tokenConfig?.workingContextBudget && tokenConfig.workingContextBudget > 0
    ? tokenConfig.workingContextBudget
    : modelMaxTokens;
  const contextBudget = Math.min(modelMaxTokens, workingBudget);
  const finalMessages = pruneChatMessages(messages, contextBudget, maxTokens);

  // Inject multi-point prompt caching for supported providers (OpenRouter, Gemini, Anthropic, DeepSeek)
  const isCacheSupported = /openrouter|anthropic|claude|gemini|deepseek|qwen/i.test(modelName);
  if (isCacheSupported && finalMessages.length >= 3) {
    // Locate the latest user message or text assistant message at or before (finalMessages.length - 2)
    // to establish a static, frozen prefix cache breakpoint across agentic loop steps.
    for (let i = finalMessages.length - 2; i >= 1; i--) {
      const candidate = finalMessages[i];
      if (candidate.role === 'user' && typeof candidate.content === 'string') {
        candidate.content = [
          {
            type: 'text',
            text: candidate.content,
            cache_control: { type: 'ephemeral' },
          },
        ];
        break;
      } else if (
        candidate.role === 'assistant' &&
        typeof candidate.content === 'string' &&
        candidate.content.trim().length > 0
      ) {
        candidate.content = [
          {
            type: 'text',
            text: candidate.content,
            cache_control: { type: 'ephemeral' },
          },
        ];
        break;
      }
    }
  }

  const payload: OpenAIRequestBody = {
    model: modelName,
    messages: finalMessages,
    ...(needsNoTemperature ? {} : { temperature: geminiBody.generationConfig?.temperature ?? 0.7 }),
    ...(needsCompletionTokens ? { max_completion_tokens: maxTokens } : { max_tokens: maxTokens }),
  };

  const normalizedEffort = effort?.toLowerCase();
  if (normalizedEffort === 'low' || normalizedEffort === 'medium' || normalizedEffort === 'high') {
    payload.reasoning_effort = normalizedEffort;
  }

  // Unified reasoning configuration for OpenRouter / Gemini / DeepSeek / Thinking models
  const isReasoningOrThinking = isThinkingModel || isReasoningModel || /gemini|deepseek|claude|qwen/i.test(lowerName);
  if (isReasoningOrThinking) {
    payload.include_reasoning = true;
    payload.reasoning = {
      effort: normalizedEffort || 'medium',
      exclude: false,
    };
  }

  if (geminiBody.tools && Array.isArray(geminiBody.tools)) {
    const openaiTools = mapGeminiToolsToOpenAI(geminiBody.tools);
    if (openaiTools.length > 0) payload.tools = openaiTools;
  }

  return payload;
}

// ─── RESPONSE: OpenAI → Gemini ─────────────────────────────────────────────

function parseDSMLToolCalls(text: string): DSMLParsedResult | null {
  try {
    const invokeRegex = /<DSML\|invoke name="([^"]+)">([\s\S]*?)<\/DSML\|invoke>/g;
    const functionCalls: { name: string; args: Record<string, unknown> }[] = [];
    let invokeMatch: RegExpExecArray | null;
    while ((invokeMatch = invokeRegex.exec(text)) !== null) {
      const funcName = invokeMatch[1];
      const paramsBlock = invokeMatch[2];
      const args: Record<string, unknown> = {};
      const paramRegex = /<DSML\|parameter name="([^"]+)"(?: string="([^"]+)")?>([\s\S]*?)<\/DSML\|parameter>/g;
      let paramMatch: RegExpExecArray | null;
      while ((paramMatch = paramRegex.exec(paramsBlock)) !== null) {
        const paramName = paramMatch[1];
        let paramValue: unknown = paramMatch[3].trim();
        const isString = paramMatch[2] === 'true';
        if (!isString) {
          try {
            paramValue = JSON.parse(paramValue as string);
          } catch (e) {
            log.debug('[OpenAI] DSML param parse fallback:', (e as Error).message); /* keep as string */
          }
        }
        args[paramName] = paramValue;
      }
      functionCalls.push({ name: funcName, args });
    }
    if (functionCalls.length === 0) return null;
    log.info(
      `[Proxy] Detected ${functionCalls.length} DSML tool call(s): ${functionCalls.map((f) => f.name).join(', ')}`,
    );
    let cleanText = text;
    cleanText = cleanText.replace(/<DSML\|tool_calls>[\s\S]*?<\/DSML\|tool_calls>/g, '');
    cleanText = cleanText.replace(/<DSML\|invoke name="[^"]+">[\s\S]*?<\/DSML\|invoke>/g, '');
    cleanText = cleanText.trim();
    return { functionCalls, cleanText };
  } catch (e) {
    log.error('[Proxy] Failed to parse DSML tool calls:', e);
    return null;
  }
}

export function mapOpenAIToGemini(openAiRes: OpenAIResponse, modelName: string): GeminiGenerateContentResponse {
  const choice = openAiRes.choices?.[0];

  if (choice?.message?.tool_calls && choice.message.tool_calls.length > 0) {
    const parts: GeminiPart[] = choice.message.tool_calls.map((tc) => {
      let args: ToolCallArgs;
      try {
        args =
          typeof tc.function.arguments === 'string'
            ? JSON.parse(tc.function.arguments)
            : (tc.function.arguments as unknown as ToolCallArgs);
      } catch (e) {
        log.debug('[OpenAI] Tool call args parse fallback:', (e as Error).message);
        args = {};
      }
      args = normalizeToolArgs(tc.function.name, args) as ToolCallArgs;
      const modelTCIds = modelToolCallIds.get(modelName) || {};
      modelTCIds[tc.function.name] = tc.id;
      modelToolCallIds.set(modelName, modelTCIds);
      touchStateTimestamp(stateTimestamps.toolCallIds, modelName);
      const translated = translateToolCallToNative(tc.function.name, args);
      if (translated.name !== tc.function.name) {
        translated.args = normalizeToolArgs(translated.name, translated.args) as Record<string, unknown>;
        translatedToolCalls.set(tc.id, {
          originalName: tc.function.name,
          translatedName: translated.name,
          cmd: args.CommandLine || '',
          cwd: args.Cwd || '',
        });
        touchStateTimestamp(stateTimestamps.translatedCalls, tc.id);
      }
      return { functionCall: { name: translated.name, args: translated.args as Record<string, unknown>, id: tc.id } };
    });
    return {
      candidates: [{ content: { parts, role: 'model' }, finishReason: 'TOOL_CALL', index: 0 }],
      usageMetadata: {
        promptTokenCount: openAiRes.usage?.prompt_tokens || 0,
        candidatesTokenCount: openAiRes.usage?.completion_tokens || 0,
        totalTokenCount: openAiRes.usage?.total_tokens || 0,
      },
    };
  }

  const text = choice?.message?.content || '';
  const dsml = parseDSMLToolCalls(text);
  if (dsml && dsml.functionCalls.length > 0) {
    const parts: GeminiPart[] = dsml.functionCalls.map((fc) => {
      const na = normalizeToolArgs(fc.name, fc.args);
      const tr = translateToolCallToNative(fc.name, na);
      return { functionCall: { name: tr.name, args: tr.args as Record<string, unknown> } };
    });
    if (dsml.cleanText) parts.unshift({ text: dsml.cleanText });
    return {
      candidates: [{ content: { parts, role: 'model' }, finishReason: 'TOOL_CALL', index: 0 }],
      usageMetadata: {
        promptTokenCount: openAiRes.usage?.prompt_tokens || 0,
        candidatesTokenCount: openAiRes.usage?.completion_tokens || 0,
        totalTokenCount: openAiRes.usage?.total_tokens || 0,
      },
    };
  }

  const reasoning =
    choice?.message?.reasoning_content ||
    choice?.message?.reasoning ||
    ((choice?.message as unknown as { reasoning_details?: { text?: string }[] })?.reasoning_details?.[0]?.text) ||
    '';
  const parts: GeminiPart[] = [];
  if (reasoning) parts.push({ text: reasoning, thought: true });
  if (text) parts.push({ text });
  const finishReason =
    choice?.finish_reason === 'stop' ? 'STOP' : choice?.finish_reason === 'length' ? 'MAX_TOKENS' : 'OTHER';
  return {
    candidates: [{ content: { parts, role: 'model' }, finishReason, index: 0 }],
    usageMetadata: {
      promptTokenCount: openAiRes.usage?.prompt_tokens || 0,
      candidatesTokenCount: openAiRes.usage?.completion_tokens || 0,
      totalTokenCount: openAiRes.usage?.total_tokens || 0,
    },
  };
}

// ─── STREAM CHUNK: OpenAI → Gemini ────────────────────────────────────────

export function mapOpenAIChunkToGemini(chunk: OpenAIResponse, modelName: string): GeminiCandidate | null {
  const choice = chunk.choices?.[0];
  if (!choice) return null;
  const delta = choice.delta;
  const streamId = ((chunk as Record<string, unknown>).id as string) || 'default_stream';

  if (!activeStreamContexts.has(streamId)) {
    activeStreamContexts.set(streamId, { accumulatedText: '', accumulatedReasoning: '', toolCalls: {} });
    touchStateTimestamp(stateTimestamps.streamCtx, streamId);
  }
  const context = activeStreamContexts.get(streamId)!;

  if (delta?.tool_calls && Array.isArray(delta.tool_calls)) {
    for (const tc of delta.tool_calls) {
      const idx = tc.index ?? 0;
      if (!context.toolCalls[idx]) context.toolCalls[idx] = { id: '', name: '', arguments: '' };
      if (tc.id) context.toolCalls[idx].id = tc.id;
      if (tc.function?.name) context.toolCalls[idx].name += tc.function.name;
      if (tc.function?.arguments) context.toolCalls[idx].arguments += tc.function.arguments;
    }
  }

  let text = delta?.content || '';
  const reasoning =
    delta?.reasoning_content ||
    delta?.reasoning ||
    ((delta as unknown as { reasoning_details?: { text?: string }[] })?.reasoning_details?.[0]?.text) ||
    '';
  if (reasoning) {
    context.accumulatedReasoning += reasoning;
    return { content: { parts: [{ text: reasoning, thought: true }], role: 'model' }, finishReason: 'OTHER', index: 0 };
  }
  if (text) context.accumulatedText += text;

  const dsml = parseDSMLToolCalls(context.accumulatedText);
  if (dsml && dsml.functionCalls.length > 0) {
    const parts: GeminiPart[] = dsml.functionCalls.map((fc) => {
      const na = normalizeToolArgs(fc.name, fc.args);
      const tr = translateToolCallToNative(fc.name, na);
      return { functionCall: { name: tr.name, args: tr.args as Record<string, unknown> } };
    });
    context.accumulatedText = '';
    return { content: { parts, role: 'model' }, finishReason: 'TOOL_CALL', index: 0 };
  }

  const finishReason = choice.finish_reason;
  if (finishReason === 'stop' || finishReason === 'length') {
    // Check for pending native tool_calls before closing stream
    const pendingToolCalls = Object.values(context.toolCalls).filter((tc) => tc.name && tc.arguments);
    if (pendingToolCalls.length > 0) {
      const parts: GeminiPart[] = pendingToolCalls.map((tc) => {
        let args: ToolCallArgs = {};
        try {
          args = JSON.parse(tc.arguments);
        } catch (_e) {
          args = {};
        }
        args = normalizeToolArgs(tc.name, args) as ToolCallArgs;
        const modelTCIds = modelToolCallIds.get(modelName) || {};
        modelTCIds[tc.name] = tc.id;
        modelToolCallIds.set(modelName, modelTCIds);
        touchStateTimestamp(stateTimestamps.toolCallIds, modelName);
        const translated = translateToolCallToNative(tc.name, args);
        if (translated.name !== tc.name) {
          translatedToolCalls.set(tc.id, {
            originalName: tc.name,
            translatedName: translated.name,
            cmd: args.CommandLine || '',
            cwd: args.Cwd || '',
          });
          touchStateTimestamp(stateTimestamps.translatedCalls, tc.id);
        }
        return { functionCall: { name: translated.name, args: translated.args as Record<string, unknown>, id: tc.id } };
      });
      activeStreamContexts.delete(streamId);
      return { content: { parts, role: 'model' }, finishReason: 'TOOL_CALL', index: 0 };
    }
    // Check for accumulated DSML tool calls
    if (context.accumulatedText) {
      const dsml2 = parseDSMLToolCalls(context.accumulatedText);
      if (dsml2 && dsml2.functionCalls.length > 0) {
        const parts: GeminiPart[] = dsml2.functionCalls.map((fc) => {
          const na = normalizeToolArgs(fc.name, fc.args);
          const tr = translateToolCallToNative(fc.name, na);
          return { functionCall: { name: tr.name, args: tr.args as Record<string, unknown> } };
        });
        if (dsml2.cleanText) parts.unshift({ text: dsml2.cleanText });
        activeStreamContexts.delete(streamId);
        return { content: { parts, role: 'model' }, finishReason: 'TOOL_CALL', index: 0 };
      }
    }
    const mappedFinishReason = finishReason === 'length' ? 'MAX_TOKENS' : 'STOP';
    activeStreamContexts.delete(streamId);
    if (!text) {
      return null;
    }
    return { content: { parts: [{ text }], role: 'model' }, finishReason: mappedFinishReason, index: 0 };
  }

  // Only emit tool calls when finishReason signals completion (args are fully accumulated)
  if (finishReason === 'tool_calls') {
    const parts: GeminiPart[] = Object.values(context.toolCalls).map((tc) => {
      let args: ToolCallArgs = {};
      try {
        args = JSON.parse(tc.arguments);
      } catch (e) {
        log.debug('[OpenAI] Stream tool args parse fallback:', (e as Error).message);
        args = {};
      }
      args = normalizeToolArgs(tc.name, args) as ToolCallArgs;
      const modelTCIds = modelToolCallIds.get(modelName) || {};
      modelTCIds[tc.name] = tc.id;
      modelToolCallIds.set(modelName, modelTCIds);
      touchStateTimestamp(stateTimestamps.toolCallIds, modelName);
      const translated = translateToolCallToNative(tc.name, args);
      if (translated.name !== tc.name) {
        translated.args = normalizeToolArgs(translated.name, translated.args) as Record<string, unknown>;
        translatedToolCalls.set(tc.id, {
          originalName: tc.name,
          translatedName: translated.name,
          cmd: args.CommandLine || '',
          cwd: args.Cwd || '',
        });
        touchStateTimestamp(stateTimestamps.translatedCalls, tc.id);
      }
      return { functionCall: { name: translated.name, args: translated.args as Record<string, unknown>, id: tc.id } };
    });
    activeStreamContexts.delete(streamId);
    return { content: { parts, role: 'model' }, finishReason: 'TOOL_CALL', index: 0 };
  }

  if (text) {
    return { content: { parts: [{ text }], role: 'model' }, finishReason: 'OTHER', index: 0 };
  }

  return null;
}

export { mapGeminiToolsToOpenAI };

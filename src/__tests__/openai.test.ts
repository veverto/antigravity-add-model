/**
 * Unit tests for OpenAI translator (openai.ts).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as shared from '../proxy/shared';
import {
  mapGeminiToOpenAI,
  mapOpenAIToGemini,
  mapOpenAIChunkToGemini,
  cleanSystemInstruction,
  pruneChatMessages,
} from '../proxy/translators/openai';

// Reset shared state before each test
beforeEach(() => {
  shared.modelToolCallIds.clear();
  shared.modelReasoningContent.clear();
  shared.activeStreamContexts.clear();
  shared.translatedToolCalls.clear();
  shared.stateTimestamps.toolCallIds.clear();
  shared.stateTimestamps.reasoning.clear();
  shared.stateTimestamps.streamCtx.clear();
  shared.stateTimestamps.translatedCalls.clear();
});

// ─── mapGeminiToOpenAI ─────────────────────────────────────────────────────

describe('mapGeminiToOpenAI', () => {
  it('should convert systemInstruction to system message', () => {
    const body = {
      systemInstruction: { parts: [{ text: 'You are helpful.' }] },
      contents: [],
    };
    const result = mapGeminiToOpenAI(body, 'gpt-4o');
    expect(result.messages[0]).toEqual({ role: 'system', content: 'You are helpful.' });
  });

  it('should convert user messages correctly', () => {
    const body = {
      contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
    };
    const result = mapGeminiToOpenAI(body, 'gpt-4o');
    expect(result.messages[0]).toEqual({ role: 'user', content: 'Hello' });
  });

  it('should convert model role to assistant', () => {
    const body = {
      contents: [{ role: 'model', parts: [{ text: 'Hi there!' }] }],
    };
    const result = mapGeminiToOpenAI(body, 'gpt-4o');
    expect(result.messages[0]).toEqual({ role: 'assistant', content: 'Hi there!', reasoning_content: '' });
  });

  it('should include reasoning_effort for low, medium, high', () => {
    const body = {
      contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
    };
    expect(mapGeminiToOpenAI(body, 'o3-mini', 'high').reasoning_effort).toBe('high');
    expect(mapGeminiToOpenAI(body, 'o3-mini', 'Medium').reasoning_effort).toBe('medium');
    expect(mapGeminiToOpenAI(body, 'o3-mini', 'LOW').reasoning_effort).toBe('low');
  });

  it('should omit reasoning_effort when effort is default, undefined, or empty', () => {
    const body = {
      contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
    };
    expect(mapGeminiToOpenAI(body, 'o3-mini', 'Default').reasoning_effort).toBeUndefined();
    expect(mapGeminiToOpenAI(body, 'o3-mini', 'default').reasoning_effort).toBeUndefined();
    expect(mapGeminiToOpenAI(body, 'o3-mini').reasoning_effort).toBeUndefined();
    expect(mapGeminiToOpenAI(body, 'gpt-4o').reasoning_effort).toBeUndefined();
  });

  it('should handle functionCall parts as tool_calls', () => {
    const body = {
      contents: [
        {
          role: 'model',
          parts: [
            {
              functionCall: { name: 'search', args: { query: 'test' }, id: 'call_123' },
            },
          ],
        },
      ],
    };
    const result = mapGeminiToOpenAI(body, 'gpt-4o');
    expect(result.messages[0].role).toBe('assistant');
    expect(result.messages[0].content).toBeNull();
    expect(result.messages[0].tool_calls).toHaveLength(1);
    expect(result.messages[0].tool_calls![0].function.name).toBe('search');
  });

  it('should handle functionResponse parts as tool messages', () => {
    const body = {
      contents: [
        {
          parts: [
            {
              functionResponse: { name: 'search', response: 'result data' },
            },
          ],
        },
      ],
    };
    const result = mapGeminiToOpenAI(body, 'gpt-4o');
    expect(result.messages[0].role).toBe('tool');
    expect(result.messages[0].content).toBe('result data');
  });

  it('should include temperature and max_tokens from generationConfig', () => {
    const body = {
      contents: [],
      generationConfig: { temperature: 0.5, maxOutputTokens: 2000 },
    };
    const result = mapGeminiToOpenAI(body, 'gpt-4o');
    expect(result.temperature).toBe(0.5);
    expect(result.max_tokens).toBe(2000);
  });

  it('should use defaults when generationConfig is missing', () => {
    const body = { contents: [] };
    const result = mapGeminiToOpenAI(body, 'gpt-4o');
    expect(result.temperature).toBe(0.7);
    expect(result.max_tokens).toBe(4000);
  });

  it('should convert Gemini tools to OpenAI format', () => {
    const body = {
      contents: [],
      tools: [
        {
          functionDeclarations: [
            {
              name: 'get_weather',
              description: 'Get weather',
              parameters: { type: 'OBJECT', properties: { city: { type: 'STRING' } } },
            },
          ],
        },
      ],
    };
    const result = mapGeminiToOpenAI(body, 'gpt-4o');
    expect(result.tools).toHaveLength(1);
    expect(result.tools![0].type).toBe('function');
    expect(result.tools![0].function.name).toBe('get_weather');
    expect((result.tools![0].function.parameters as Record<string, string>).type).toBe('object');
  });

  it('should include reasoning_content on assistant messages', () => {
    const body = {
      contents: [
        {
          role: 'model',
          parts: [
            { text: 'answer', thought: false },
            { text: 'thinking...', thought: true },
          ],
        },
      ],
    };
    const result = mapGeminiToOpenAI(body, 'deepseek-model');
    const assistant = result.messages.find((m) => m.role === 'assistant')!;
    expect(assistant.content).toBe('answer');
    expect(assistant.reasoning_content).toBe('thinking...');
  });

  it('should handle multiple contents', () => {
    const body = {
      contents: [
        { role: 'user', parts: [{ text: 'Q1' }] },
        { role: 'model', parts: [{ text: 'A1' }] },
        { role: 'user', parts: [{ text: 'Q2' }] },
      ],
    };
    const result = mapGeminiToOpenAI(body, 'gpt-4o');
    expect(result.messages).toHaveLength(3);
    expect(result.messages[0].role).toBe('user');
    expect(result.messages[1].role).toBe('assistant');
    expect(result.messages[2].role).toBe('user');
  });
});

// ─── mapOpenAIToGemini ─────────────────────────────────────────────────────

describe('mapOpenAIToGemini', () => {
  it('should convert simple text response', () => {
    const res = {
      choices: [{ message: { content: 'Hello!' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    };
    const result = mapOpenAIToGemini(res, 'gpt-4o');
    expect(result.candidates[0].content.parts[0]).toEqual({ text: 'Hello!' });
    expect(result.candidates[0].finishReason).toBe('STOP');
  });

  it('should map finish_reason length to MAX_TOKENS', () => {
    const res = {
      choices: [{ message: { content: 'Partial...' }, finish_reason: 'length' }],
      usage: { prompt_tokens: 10, completion_tokens: 2048, total_tokens: 2058 },
    };
    const result = mapOpenAIToGemini(res, 'gpt-4o');
    expect(result.candidates[0].finishReason).toBe('MAX_TOKENS');
  });

  it('should convert tool_calls to functionCall parts', () => {
    const res = {
      choices: [
        {
          message: {
            tool_calls: [
              {
                id: 'call_1',
                type: 'function' as const,
                function: { name: 'search', arguments: '{"query":"test"}' },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
      usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
    };
    const result = mapOpenAIToGemini(res, 'gpt-4o');
    expect(result.candidates[0].finishReason).toBe('TOOL_CALL');
    expect(result.candidates[0].content.parts[0].functionCall).toBeDefined();
    expect(result.candidates[0].content.parts[0].functionCall!.name).toBe('search');
  });

  it('should parse DSML tool calls from text content', () => {
    const res = {
      choices: [
        {
          message: {
            content:
              'Here is result\n<DSML|invoke name="search_web">\n<DSML|parameter name="query" string="true">news</DSML|parameter>\n</DSML|invoke>',
          },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
    };
    const result = mapOpenAIToGemini(res, 'deepseek-v4');
    expect(result.candidates[0].finishReason).toBe('TOOL_CALL');
    const fcParts = result.candidates[0].content.parts.filter((p) => p.functionCall);
    expect(fcParts.length).toBeGreaterThan(0);
  });

  it('should include reasoning_content as thought part', () => {
    const res = {
      choices: [
        {
          message: { content: 'answer', reasoning_content: 'thinking...' },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
    };
    const result = mapOpenAIToGemini(res, 'deepseek-v4');
    const parts = result.candidates[0].content.parts;
    expect(parts.some((p) => p.thought)).toBe(true);
    expect(parts.some((p) => p.text === 'thinking...')).toBe(true);
    expect(parts.some((p) => p.text === 'answer')).toBe(true);
  });

  it('should handle empty choices gracefully', () => {
    const res = { choices: [], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } };
    expect(() => mapOpenAIToGemini(res, 'gpt-4o')).not.toThrow();
  });

  it('should handle missing usage', () => {
    const res = { choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] };
    const result = mapOpenAIToGemini(res, 'gpt-4o');
    expect(result.usageMetadata).toBeDefined();
    expect(result.usageMetadata!.totalTokenCount).toBe(0);
  });

  it('should handle finish_reason other than stop or length', () => {
    const res = {
      choices: [{ message: { content: 'filtered...' }, finish_reason: 'content_filter' }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    };
    const result = mapOpenAIToGemini(res, 'gpt-4o');
    expect(result.candidates[0].finishReason).toBe('OTHER');
  });
});

// ─── mapOpenAIChunkToGemini (Streaming) ────────────────────────────────────

describe('mapOpenAIChunkToGemini', () => {
  it('should return text delta chunk', () => {
    const chunk = {
      id: 'stream_1',
      choices: [{ delta: { content: 'Hello' }, index: 0 }],
    };
    const result = mapOpenAIChunkToGemini(chunk, 'gpt-4o');
    expect(result).not.toBeNull();
    expect(result!.content.parts[0]).toEqual({ text: 'Hello' });
  });

  it('should return reasoning delta as thought part', () => {
    const chunk = {
      id: 'stream_1',
      choices: [{ delta: { reasoning_content: 'thinking...' }, index: 0 }],
    };
    const result = mapOpenAIChunkToGemini(chunk, 'deepseek-v4');
    expect(result).not.toBeNull();
    expect(result!.content.parts[0]).toEqual({ text: 'thinking...', thought: true });
  });

  it('should accumulate and emit tool calls on finish_reason tool_calls', () => {
    // Accumulate tool call fragments
    mapOpenAIChunkToGemini(
      {
        id: 'stream_tc',
        choices: [
          {
            delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'search', arguments: '{"q"' } }] },
            index: 0,
          },
        ],
      },
      'gpt-4o',
    );
    mapOpenAIChunkToGemini(
      {
        id: 'stream_tc',
        choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: ':"test"}' } }] }, index: 0 }],
      },
      'gpt-4o',
    );

    // Final chunk with tool_calls finish
    const result = mapOpenAIChunkToGemini(
      {
        id: 'stream_tc',
        choices: [{ delta: {}, finish_reason: 'tool_calls', index: 0 }],
      },
      'gpt-4o',
    );
    expect(result).not.toBeNull();
    expect(result!.finishReason).toBe('TOOL_CALL');
  });

  it('should handle stop finish with pending tool calls', () => {
    mapOpenAIChunkToGemini(
      {
        id: 'stream_stop_tc',
        choices: [
          {
            delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'read', arguments: '{"path":"/f"}' } }] },
            index: 0,
          },
        ],
      },
      'gpt-4o',
    );

    const result = mapOpenAIChunkToGemini(
      {
        id: 'stream_stop_tc',
        choices: [{ delta: {}, finish_reason: 'stop', index: 0 }],
      },
      'gpt-4o',
    );
    expect(result).not.toBeNull();
    // If tool calls were pending, they should be emitted
  });

  it('should handle stop finish with no pending state', () => {
    const result = mapOpenAIChunkToGemini(
      {
        id: 'stream_clean',
        choices: [{ delta: { content: 'done' }, finish_reason: 'stop', index: 0 }],
      },
      'gpt-4o',
    );
    expect(result).not.toBeNull();
    expect(result!.finishReason).toBe('STOP');
  });

  it('should map stream finish_reason length to MAX_TOKENS', () => {
    const result = mapOpenAIChunkToGemini(
      {
        id: 'stream_length',
        choices: [{ delta: { content: 'cut off' }, finish_reason: 'length', index: 0 }],
      },
      'gpt-4o',
    );
    expect(result).not.toBeNull();
    expect(result!.finishReason).toBe('MAX_TOKENS');
  });

  it('should return null for empty choice', () => {
    const chunk = { id: 'empty', choices: [] };
    const result = mapOpenAIChunkToGemini(chunk, 'gpt-4o');
    expect(result).toBeNull();
  });

  it('should detect DSML tool calls in accumulated streaming text', () => {
    const dsmlText =
      'Result:\n<DSML|invoke name="run_command">\n<DSML|parameter name="CommandLine" string="true">ls</DSML|parameter>\n</DSML|invoke>';
    const chunk = {
      id: 'stream_dsml',
      choices: [{ delta: { content: dsmlText }, index: 0 }],
    };
    const result = mapOpenAIChunkToGemini(chunk, 'deepseek-v4');
    expect(result).not.toBeNull();
    const fcParts = result!.content.parts.filter((p) => p.functionCall);
    expect(fcParts.length).toBeGreaterThan(0);
  });
});

describe('cleanSystemInstruction and pruneChatMessages', () => {
  it('cleanSystemInstruction strips bloated tutorial XML tags but preserves rules and identity', () => {
    const raw = `
<identity>You are an AI assistant.</identity>
<user_rules>Always format in markdown.</user_rules>
<web_application_development>
1. Core: Use HTML and Vanilla CSS.
2. Styling: No Tailwind unless asked.
Huge 100-line tutorial on Vite, animations, Google fonts...
</web_application_development>
<artifacts>
Mermaid diagrams, carousel backtick rules, diff format guide...
</artifacts>
<conversation_transcript>
grep "invoke_subagent" logs/transcript.jsonl
</conversation_transcript>
<guidelines>Preserve existing comments.</guidelines>
`;
    const cleaned = cleanSystemInstruction(raw);
    expect(cleaned).toContain('<identity>You are an AI assistant.</identity>');
    expect(cleaned).toContain('<user_rules>Always format in markdown.</user_rules>');
    expect(cleaned).toContain('<guidelines>Preserve existing comments.</guidelines>');
    expect(cleaned).not.toContain('<web_application_development>');
    expect(cleaned).not.toContain('<artifacts>');
    expect(cleaned).not.toContain('<conversation_transcript>');
  });

  it('pruneChatMessages preserves first user message and aligns sliding window to safe user turn', () => {
    const msgs = [
      { role: 'system', content: 'You are an agent.' },
      { role: 'user', content: 'Initial project goal: build a chat app' },
      { role: 'assistant', content: 'Got it, starting step 1' },
      { role: 'user', content: 'Step 2' },
      { role: 'assistant', content: 'Step 2 done' },
      { role: 'user', content: 'Step 3' },
      { role: 'assistant', content: 'Step 3 done' },
      { role: 'user', content: 'Step 4' },
      { role: 'assistant', content: 'Step 4 done' },
      { role: 'user', content: 'Step 5' },
      { role: 'assistant', content: 'Step 5 done' },
      { role: 'user', content: 'Current question: what is the status?' },
    ];

    const pruned = pruneChatMessages(msgs as any, 4);
    expect(pruned[0].role).toBe('system');
    expect(pruned[1].content).toBe('Initial project goal: build a chat app');
    expect(pruned[pruned.length - 1].content).toBe('Current question: what is the status?');
    // Total messages pruned should be much smaller than original 12
    expect(pruned.length).toBeLessThan(12);
  });

  it('pruneChatMessages truncates oversized tool outputs in history', () => {
    const hugeOutput = 'x'.repeat(6000);
    const msgs = [
      { role: 'user', content: 'list dir' },
      { role: 'tool', content: hugeOutput, tool_call_id: 'call_1' },
      { role: 'assistant', content: 'done' },
    ];
    const pruned = pruneChatMessages(msgs as any, 10);
    const toolMsg = pruned.find((m) => m.role === 'tool');
    expect(toolMsg).toBeDefined();
    expect(toolMsg!.content.length).toBeLessThan(3000);
    expect(toolMsg!.content).toContain('truncated');
  });

  it('pruneChatMessages never drops the active user prompt even with many tool calls in the active turn', () => {
    const msgs: any[] = [
      { role: 'user', content: 'Checkpoint: old conversation history' },
      { role: 'assistant', content: 'old answer' },
      { role: 'user', content: 'Active prompt: investigate banner loading' },
    ];
    for (let i = 1; i <= 20; i++) {
      msgs.push({ role: 'assistant', tool_calls: [{ id: `call_${i}` }] });
      msgs.push({ role: 'tool', tool_call_id: `call_${i}`, content: `output ${i}` });
    }

    const pruned = pruneChatMessages(msgs, 25);
    const hasActivePrompt = pruned.some((m) => typeof m.content === 'string' && m.content.includes('Active prompt'));
    expect(hasActivePrompt).toBe(true);
    const activeIdx = pruned.findIndex((m) => typeof m.content === 'string' && m.content.includes('Active prompt'));
    expect(pruned[activeIdx + 1]?.role).toBe('assistant');
  });

  it('mapGeminiToOpenAI formats system prompt with OpenRouter/Anthropic cache_control content block', () => {
    const geminiBody = {
      systemInstruction: {
        parts: [{ text: 'You are an advanced agentic assistant.' }],
      },
      contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
    };

    const payload = mapGeminiToOpenAI(geminiBody as any, 'openrouter/google/gemini-3.8-flash');
    expect(payload.messages[0].role).toBe('system');
    expect(Array.isArray(payload.messages[0].content)).toBe(true);
    const contentBlocks = payload.messages[0].content as any[];
    expect(contentBlocks[0]).toEqual({
      type: 'text',
      text: 'You are an advanced agentic assistant.',
      cache_control: { type: 'ephemeral' },
    });
  });

  it('pruneChatMessages preserves 100% of messages when within model token budget (Zero Pruning)', () => {
    const msgs: any[] = [
      { role: 'system', content: 'You are an agent.' },
      { role: 'user', content: 'Initial request: fix navbar' },
    ];
    // Create 30 tool interactions (60 messages)
    for (let i = 1; i <= 30; i++) {
      msgs.push({ role: 'assistant', tool_calls: [{ id: `call_${i}`, function: { name: 'run_command', arguments: '{"CommandLine":"ls"}' } }] });
      msgs.push({ role: 'tool', tool_call_id: `call_${i}`, content: `output of tool ${i}: total 10 files found in directory.` });
    }
    msgs.push({ role: 'user', content: 'Now edit the header.' });

    // With a 1M token budget (Gemini 3.8 Flash), total 63 messages should NOT be pruned at all
    const result = pruneChatMessages(msgs, 1_048_576, 8192);
    expect(result.length).toBe(msgs.length);
    expect(result[result.length - 1].content).toBe('Now edit the header.');
  });

  it('pruneChatMessages scales dynamically to model context config passed from proxy', () => {
    const geminiBody = {
      contents: [
        { role: 'user', parts: [{ text: 'Step 1' }] },
        { role: 'model', parts: [{ text: 'Step 1 done' }] },
        { role: 'user', parts: [{ text: 'Step 2' }] },
        { role: 'model', parts: [{ text: 'Step 2 done' }] },
      ],
    };

    // Model configured with 1M tokens: mapGeminiToOpenAI preserves all turns
    const payload = mapGeminiToOpenAI(
      geminiBody as any,
      'google/gemini-3.8-flash',
      'medium',
      { maxTokens: 1_048_576, maxOutputTokens: 8192 },
    );
    expect(payload.messages.length).toBe(4);
  });

  it('pruneChatMessages tombstones older tool outputs (>400 chars) in past turns while keeping active turn tool output full', () => {
    const msgs: any[] = [
      { role: 'user', content: 'Initial project prompt' },
      { role: 'assistant', tool_calls: [{ id: 'call_old', function: { name: 'view_file', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 'call_old', content: 'x'.repeat(1000) }, // Past turn: 1000 chars
      { role: 'user', content: 'Now run next step' }, // Active turn starts here
      { role: 'assistant', tool_calls: [{ id: 'call_recent', function: { name: 'view_file', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 'call_recent', content: 'y'.repeat(1000) }, // Active turn: 1000 chars
    ];

    const result = pruneChatMessages(msgs, 40_000, 8192);
    // Old tool output should be tombstoned
    const oldToolMsg = result.find((m) => m.tool_call_id === 'call_old');
    expect(oldToolMsg?.content).toContain('[Older tool output truncated: 1000 chars to preserve context budget]');
    expect(oldToolMsg?.content?.length).toBeLessThan(450);

    // Active turn tool output should be 100% full
    const recentToolMsg = result.find((m) => m.tool_call_id === 'call_recent');
    expect(recentToolMsg?.content).toBe('y'.repeat(1000));
  });

  it('mapGeminiToOpenAI injects multi-point cache_control on penultimate message for OpenRouter/Gemini', () => {
    const geminiBody = {
      systemInstruction: { parts: [{ text: 'System rules' }] },
      contents: [
        { role: 'user', parts: [{ text: 'Turn 1 user request' }] },
        { role: 'model', parts: [{ text: 'Turn 1 assistant answer' }] },
        { role: 'user', parts: [{ text: 'Turn 2 user confirmation' }] },
      ],
    };

    const payload = mapGeminiToOpenAI(
      geminiBody as any,
      'google/gemini-3.8-flash',
      'medium',
      { maxTokens: 1_048_576, maxOutputTokens: 8192 },
    );

    // System prompt has cache_control (Breakpoint 1)
    expect((payload.messages[0].content as any)[0].cache_control).toEqual({ type: 'ephemeral' });

    // Penultimate message has cache_control (Breakpoint 2)
    const penultimateMsg = payload.messages[payload.messages.length - 2];
    expect(Array.isArray(penultimateMsg.content)).toBe(true);
    expect((penultimateMsg.content as any)[0].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('mapGeminiToOpenAI caps working memory budget to prevent token burn on long conversations', () => {
    // Simulate a long conversation with 80 past turns each having a large message
    const contents: any[] = [{ role: 'user', parts: [{ text: 'Goal: build an entire operating system' }] }];
    for (let i = 1; i <= 80; i++) {
      contents.push({ role: 'model', parts: [{ text: `Answer ${i}: ` + 'word '.repeat(300) }] });
      contents.push({ role: 'user', parts: [{ text: `Feedback ${i}: ` + 'ok '.repeat(100) }] });
    }
    contents.push({ role: 'user', parts: [{ text: 'Sim' }] }); // Latest user message

    const geminiBody = {
      systemInstruction: { parts: [{ text: 'System instructions' }] },
      contents,
    };

    const payload = mapGeminiToOpenAI(
      geminiBody as any,
      'google/gemini-3.8-flash',
      'medium',
      { maxTokens: 1_048_576, maxOutputTokens: 8192 },
    );

    // Total messages pruned to fit workingContextBudget (40k tokens), not sending all 160+ raw turns
    expect(payload.messages.length).toBeLessThan(contents.length);
    // Preserves first user goal and active user turn
    expect(payload.messages[1].content).toContain('Goal: build an entire operating system');
    expect(payload.messages[payload.messages.length - 1].content).toBe('Sim');
  });
});

/**
 * Shared translator utility functions.
 * Extracted from proxy.js to avoid duplication across translator modules.
 */

import * as path from 'path';
import log from 'electron-log';

// ─── Types ────────────────────────────────────────────────────────────────

export interface GeminiParameterProperties {
  type?: string;
  properties?: GeminiParameterProperties;
  items?: GeminiParameterProperties;
  [key: string]: unknown;
}

export interface ToolCallArgs {
  CommandLine?: string;
  Cwd?: string;
  [key: string]: unknown;
}

export interface TranslatedToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface TranslatedCallInfo {
  originalName: string;
  translatedName: string;
  cmd: string;
  cwd?: string;
}

export interface MatchResult {
  Filename: string;
  LineNumber: number;
  LineContent: string;
}

export interface DirectoryItem {
  name: string;
  isDir: boolean;
  sizeBytes?: number;
}

export interface FileListResponse {
  files?: DirectoryItem[];
  children?: DirectoryItem[];
  content?: string;
  CodeContent?: string;
}

export type ToolResponse = string | DirectoryItem[] | MatchResult[] | FileListResponse;

// ─── Tool Parameter Normalization ──────────────────────────────────────────

export const TOOL_NAME_ALIASES: Record<string, string> = {
  view_file: 'read_file',
  readFile: 'read_file',
  read_file_content: 'read_file',
  cat: 'read_file',
  replace_file_content: 'edit_file',
  editFile: 'edit_file',
  str_replace_editor: 'edit_file',
  writeFile: 'write_file',
  save_file: 'write_file',
  create_file: 'write_file',
  execute_command: 'run_command',
  bash: 'run_command',
  terminal: 'run_command',
  sh: 'run_command',
  web_search: 'search_web',
  google_search: 'search_web',
};

export function normalizeToolName(name: string): string {
  return TOOL_NAME_ALIASES[name] || name;
}

export interface ParamConfig {
  aliases?: string[];
  type?: 'string' | 'number' | 'boolean' | 'array' | 'object';
  defaultValue?: unknown;
}

export interface ToolSchemaConfig {
  primaryKey?: string;
  params: Record<string, ParamConfig>;
  required?: string[];
}

export const TOOL_SCHEMAS: Record<string, ToolSchemaConfig> = {
  // ── 1. read_file ─────────────────────────────────────────
  read_file: {
    primaryKey: 'Path',
    params: {
      Path: {
        aliases: [
          'path',
          'filePath',
          'file_path',
          'AbsolutePath',
          'absolute_path',
          'file',
          'filename',
          'uri',
          'target',
          'source',
          'input',
          'target_file',
          'targetFile',
          'FilePath',
          'FileName',
        ],
        type: 'string',
      },
      StartLine: {
        aliases: ['start_line', 'startLine', 'from_line', 'fromLine', 'start', 'line_start'],
        type: 'number',
      },
      EndLine: {
        aliases: ['end_line', 'endLine', 'to_line', 'toLine', 'end', 'line_end'],
        type: 'number',
      },
      ByteOffset: {
        aliases: ['byte_offset', 'byteOffset', 'offset'],
        type: 'number',
      },
    },
    required: ['Path'],
  },

  // ── 2. write_file ────────────────────────────────────────
  write_file: {
    primaryKey: 'Path',
    params: {
      Path: {
        aliases: [
          'path',
          'filePath',
          'file_path',
          'AbsolutePath',
          'absolute_path',
          'file',
          'filename',
          'target_file',
          'targetFile',
          'dest',
          'destination',
          'target',
          'FilePath',
          'FileName',
        ],
        type: 'string',
      },
      Content: {
        aliases: ['content', 'code', 'text', 'data', 'body', 'file_content', 'fileContent'],
        type: 'string',
      },
      Overwrite: {
        aliases: ['overwrite', 'force'],
        type: 'boolean',
      },
      Append: {
        aliases: ['append'],
        type: 'boolean',
      },
      ArtifactMetadata: {
        aliases: ['artifact_metadata', 'artifactMetadata', 'metadata'],
        type: 'object',
      },
    },
    required: ['Path', 'Content'],
  },

  // ── 3. edit_file ─────────────────────────────────────────
  edit_file: {
    primaryKey: 'Path',
    params: {
      Path: {
        aliases: [
          'path',
          'filePath',
          'file_path',
          'AbsolutePath',
          'absolute_path',
          'file',
          'filename',
          'target_file',
          'targetFile',
          'FilePath',
          'FileName',
        ],
        type: 'string',
      },
      Target: {
        aliases: [
          'target',
          'old_string',
          'oldString',
          'old_str',
          'oldStr',
          'search',
          'find',
          'original',
          'old_content',
          'oldText',
        ],
        type: 'string',
      },
      Replacement: {
        aliases: [
          'replacement',
          'new_string',
          'newString',
          'new_str',
          'newStr',
          'replace',
          'modified',
          'new_content',
          'newText',
        ],
        type: 'string',
      },
      ArtifactMetadata: {
        aliases: ['artifact_metadata', 'artifactMetadata', 'metadata'],
        type: 'object',
      },
    },
    required: ['Path', 'Target', 'Replacement'],
  },

  // ── 4. run_command ───────────────────────────────────────
  run_command: {
    primaryKey: 'CommandLine',
    params: {
      CommandLine: {
        aliases: [
          'command_line',
          'commandLine',
          'cmd',
          'command',
          'Command',
          'Cmd',
          'shell_command',
          'shellCommand',
          'script',
          'exec',
          'execute',
        ],
        type: 'string',
      },
      WaitMsBeforeAsync: {
        aliases: ['wait_ms_before_async', 'waitMsBeforeAsync', 'timeout', 'timeoutMs', 'timeout_ms', 'wait_ms'],
        type: 'number',
        defaultValue: 5000,
      },
      toolSummary: {
        aliases: ['tool_summary', 'toolSummary', 'summary', 'description', 'title'],
        type: 'string',
        defaultValue: 'Run command',
      },
      IsDaemon: {
        aliases: ['is_daemon', 'isDaemon', 'daemon', 'background'],
        type: 'boolean',
      },
    },
    required: ['CommandLine', 'WaitMsBeforeAsync', 'toolSummary'],
  },

  // ── 5. search_web ────────────────────────────────────────
  search_web: {
    primaryKey: 'query',
    params: {
      query: {
        aliases: ['Query', 'q', 'search', 'term', 'keyword', 'search_query', 'searchQuery', 'text'],
        type: 'string',
      },
      domain: {
        aliases: ['Domain', 'site', 'url'],
        type: 'string',
      },
    },
    required: ['query'],
  },

  // ── 6. manage_task ───────────────────────────────────────
  manage_task: {
    primaryKey: 'Action',
    params: {
      Action: {
        aliases: ['action', 'type', 'operation'],
        type: 'string',
      },
      TaskId: {
        aliases: ['task_id', 'taskId', 'id', 'task'],
        type: 'string',
      },
      Input: {
        aliases: ['input', 'message', 'text', 'data'],
        type: 'string',
      },
    },
    required: ['Action'],
  },

  // ── 7. ask_question ──────────────────────────────────────
  ask_question: {
    primaryKey: 'questions',
    params: {
      questions: {
        aliases: ['Questions', 'question', 'Question', 'items'],
        type: 'array',
      },
    },
    required: ['questions'],
  },

  // ── 8. call_mcp_tool ─────────────────────────────────────
  call_mcp_tool: {
    primaryKey: 'ToolName',
    params: {
      ServerName: {
        aliases: ['server_name', 'serverName', 'server'],
        type: 'string',
      },
      ToolName: {
        aliases: ['tool_name', 'toolName', 'tool'],
        type: 'string',
      },
      Arguments: {
        aliases: ['arguments', 'args', 'parameters', 'params'],
        type: 'object',
        defaultValue: {},
      },
    },
    required: ['ServerName', 'ToolName', 'Arguments'],
  },

  // ── 9. invoke_subagent ───────────────────────────────────
  invoke_subagent: {
    primaryKey: 'TypeName',
    params: {
      TypeName: {
        aliases: ['type_name', 'typeName', 'type', 'name'],
        type: 'string',
      },
      Role: {
        aliases: ['role', 'title'],
        type: 'string',
      },
      Prompt: {
        aliases: ['prompt', 'instruction', 'task', 'message'],
        type: 'string',
      },
      Model: {
        aliases: ['model'],
        type: 'string',
      },
      Workspace: {
        aliases: ['workspace'],
        type: 'string',
      },
    },
    required: ['TypeName', 'Role', 'Prompt'],
  },

  // ── 10. define_subagent ──────────────────────────────────
  define_subagent: {
    primaryKey: 'Name',
    params: {
      Name: {
        aliases: ['name'],
        type: 'string',
      },
      Description: {
        aliases: ['description', 'desc'],
        type: 'string',
      },
      SystemPrompt: {
        aliases: ['system_prompt', 'systemPrompt', 'prompt', 'instructions'],
        type: 'string',
      },
      EnableWriteTools: {
        aliases: ['enable_write_tools', 'enableWriteTools'],
        type: 'boolean',
      },
      EnableSubagentTools: {
        aliases: ['enable_subagent_tools', 'enableSubagentTools'],
        type: 'boolean',
      },
      EnableMCPTools: {
        aliases: ['enable_mcp_tools', 'enableMcpTools'],
        type: 'boolean',
      },
    },
    required: ['Name', 'Description', 'SystemPrompt'],
  },

  // ── 11. manage_subagents ─────────────────────────────────
  manage_subagents: {
    primaryKey: 'Action',
    params: {
      Action: {
        aliases: ['action', 'operation'],
        type: 'string',
      },
      ConversationIds: {
        aliases: ['conversation_ids', 'conversationIds', 'ids', 'subagent_ids', 'subagentIds'],
        type: 'array',
      },
    },
    required: ['Action'],
  },

  // ── 12. schedule ─────────────────────────────────────────
  schedule: {
    primaryKey: 'Prompt',
    params: {
      Prompt: {
        aliases: ['prompt', 'message', 'instruction'],
        type: 'string',
      },
      DurationSeconds: {
        aliases: ['duration_seconds', 'durationSeconds', 'duration', 'seconds'],
        type: 'number',
      },
      CronExpression: {
        aliases: ['cron_expression', 'cronExpression', 'cron', 'schedule'],
        type: 'string',
      },
      ExactTiming: {
        aliases: ['exact_timing', 'exactTiming'],
        type: 'boolean',
      },
      IsDaemon: {
        aliases: ['is_daemon', 'isDaemon', 'daemon'],
        type: 'boolean',
      },
      MaxIterations: {
        aliases: ['max_iterations', 'maxIterations', 'limit'],
        type: 'number',
      },
      TimerCondition: {
        aliases: ['timer_condition', 'timerCondition', 'condition'],
        type: 'string',
      },
    },
    required: ['Prompt'],
  },

  // ── 13. search_marketplace ───────────────────────────────
  search_marketplace: {
    primaryKey: 'queries',
    params: {
      queries: {
        aliases: ['Queries', 'query', 'Query', 'search'],
        type: 'array',
      },
      kind: {
        aliases: ['kind', 'type'],
        type: 'string',
      },
      limit: {
        aliases: ['limit', 'max'],
        type: 'number',
      },
    },
    required: ['queries'],
  },

  // ── 14. list_resources ───────────────────────────────────
  list_resources: {
    primaryKey: 'ServerName',
    params: {
      ServerName: {
        aliases: ['server_name', 'serverName', 'server'],
        type: 'string',
      },
    },
    required: ['ServerName'],
  },

  // ── 15. read_resource ────────────────────────────────────
  read_resource: {
    primaryKey: 'ServerName',
    params: {
      ServerName: {
        aliases: ['server_name', 'serverName', 'server'],
        type: 'string',
      },
      Uri: {
        aliases: ['uri', 'url', 'resource_uri', 'resourceUri'],
        type: 'string',
      },
    },
    required: ['ServerName', 'Uri'],
  },

  // ── 16. list_plugin_accounts ─────────────────────────────
  list_plugin_accounts: {
    params: {},
  },

  // ── 17. send_message ─────────────────────────────────────
  send_message: {
    primaryKey: 'Recipient',
    params: {
      Recipient: {
        aliases: ['recipient', 'to', 'conversation_id', 'conversationId', 'id'],
        type: 'string',
      },
      Message: {
        aliases: ['message', 'text', 'content', 'msg'],
        type: 'string',
      },
    },
    required: ['Recipient', 'Message'],
  },

  // ── Legacy tools (kept for backward compatibility) ───────
  list_dir: {
    primaryKey: 'DirectoryPath',
    params: {
      DirectoryPath: {
        aliases: [
          'directory_path',
          'directoryPath',
          'path',
          'dir_path',
          'dirPath',
          'dir',
          'directory',
          'folder',
          'FolderPath',
          'folder_path',
          'target',
          'root',
          'base',
        ],
        type: 'string',
      },
    },
  },
  grep_search: {
    primaryKey: 'Query',
    params: {
      Query: {
        aliases: [
          'query',
          'search',
          'SearchQuery',
          'search_query',
          'searchQuery',
          'pattern',
          'Pattern',
          'regex',
          'Regex',
          'term',
          'keyword',
          'text',
          'needle',
        ],
        type: 'string',
      },
      SearchPath: {
        aliases: [
          'search_path',
          'searchPath',
          'path',
          'directory',
          'DirectoryPath',
          'directory_path',
          'folder',
          'dir',
          'root',
          'base',
        ],
        type: 'string',
      },
    },
  },
  search_files: {
    primaryKey: 'SearchPath',
    params: {
      SearchPath: {
        aliases: [
          'search_path',
          'searchPath',
          'path',
          'directory',
          'DirectoryPath',
          'directory_path',
          'folder',
          'dir',
          'root',
          'base',
        ],
        type: 'string',
      },
    },
  },
  create_directory: {
    primaryKey: 'DirectoryPath',
    params: {
      DirectoryPath: {
        aliases: ['directory_path', 'directoryPath', 'path', 'dir_path', 'dirPath', 'dir', 'folder', 'target', 'name'],
        type: 'string',
      },
    },
  },
  delete_file: {
    primaryKey: 'Path',
    params: {
      Path: {
        aliases: ['path', 'file_path', 'filePath', 'file', 'filename', 'target', 'AbsolutePath', 'absolute_path'],
        type: 'string',
      },
    },
  },
  move_file: {
    primaryKey: 'SourcePath',
    params: {
      SourcePath: {
        aliases: ['source_path', 'sourcePath', 'source', 'from', 'src', 'path', 'file_path', 'filePath', 'AbsolutePath', 'absolute_path'],
        type: 'string',
      },
      DestinationPath: {
        aliases: ['destination_path', 'destinationPath', 'dest', 'destination', 'to', 'dst', 'target'],
        type: 'string',
      },
    },
  },
};

function coerceParamValue(value: unknown, targetType?: string): unknown {
  if (value === undefined || value === null) return value;
  if (targetType === 'number') {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (!isNaN(parsed)) return parsed;
    }
    return value;
  }
  if (targetType === 'boolean') {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const lower = value.toLowerCase().trim();
      if (lower === 'true' || lower === '1') return true;
      if (lower === 'false' || lower === '0') return false;
    }
    return Boolean(value);
  }
  if (targetType === 'array') {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      if (value.startsWith('[') && value.endsWith(']')) {
        try {
          const parsed = JSON.parse(value);
          if (Array.isArray(parsed)) return parsed;
        } catch {}
      }
      return [value];
    }
    if (typeof value === 'object' && value !== null) {
      return [value];
    }
    return [value];
  }
  if (targetType === 'object') {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) return parsed;
      } catch {}
    }
    return value;
  }
  if (targetType === 'string') {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  }
  return value;
}

/**
 * Normalizes parameter names from external models to match Antigravity's expected format.
 * Coerces parameter types (stringified numbers -> number, booleans, arrays) and prevents
 * illegal extra properties (e.g. AbsolutePath) from being injected into strict Cortex schemas.
 */
export function normalizeToolArgs(
  name: string,
  args: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!args || typeof args !== 'object') return args || {};

  const canonicalName = TOOL_NAME_ALIASES[name] || name;
  const config = TOOL_SCHEMAS[canonicalName] || TOOL_SCHEMAS[name];

  // Handle array args
  if (Array.isArray(args)) {
    if (config?.primaryKey && args.length > 0 && typeof args[0] === 'string') {
      return { [config.primaryKey]: args[0] };
    }
    return {};
  }

  // If tool is NOT in TOOL_SCHEMAS (e.g. custom MCP tool), return arguments safely without destructive fallbacks
  if (!config) {
    return { ...args };
  }

  const normalized: Record<string, unknown> = {};
  const usedInputKeys = new Set<string>();

  // Special handler for ask_question where model sends { question: "...", options: [...] }
  if (canonicalName === 'ask_question') {
    if (args.question && !args.questions) {
      const qItem: Record<string, unknown> = {
        question: args.question,
      };
      if (args.options) qItem.options = Array.isArray(args.options) ? args.options : [args.options];
      if (args.is_multi_select !== undefined) qItem.is_multi_select = Boolean(args.is_multi_select);
      return { questions: [qItem] };
    }
  }

  // Special handler for run_command: if Cwd is provided and CommandLine doesn't start with cd, prepend cwd
  if (canonicalName === 'run_command' && (args.Cwd || args.cwd) && typeof (args.CommandLine || args.cmd || args.command) === 'string') {
    const rawCmd = (args.CommandLine || args.cmd || args.command) as string;
    const rawCwd = (args.Cwd || args.cwd) as string;
    if (!rawCmd.trim().startsWith('cd ') && rawCwd) {
      // Keep Cwd in args for translateToolCallToNative to use if needed
    }
  }

  // Map each configured canonical parameter
  for (const [canonParam, paramCfg] of Object.entries(config.params)) {
    // 1. Direct match
    if (canonParam in args) {
      normalized[canonParam] = coerceParamValue(args[canonParam], paramCfg.type);
      usedInputKeys.add(canonParam);
      continue;
    }

    // 2. Alias match
    if (paramCfg.aliases) {
      for (const alias of paramCfg.aliases) {
        if (alias in args) {
          normalized[canonParam] = coerceParamValue(args[alias], paramCfg.type);
          usedInputKeys.add(alias);
          break;
        }
      }
    }
  }

  // If primaryKey is still missing, fallback heuristics to find value in unassigned string arguments
  if (config.primaryKey && !normalized[config.primaryKey]) {
    const unassigned = Object.entries(args).filter(([k]) => !usedInputKeys.has(k));
    let found = unassigned.find(
      ([, v]) => typeof v === 'string' && (v.includes('/') || v.includes('\\') || v.includes('.')),
    );
    if (!found) found = unassigned.find(([, v]) => typeof v === 'string' && v.length > 0);

    if (found) {
      const pCfg = config.params[config.primaryKey];
      normalized[config.primaryKey] = coerceParamValue(found[1], pCfg?.type);
      usedInputKeys.add(found[0]);
      log.info(`[Utils] normalizeToolArgs fallback: "${canonicalName}" extracted ${config.primaryKey} from "${found[0]}"`);
    }
  }

  // Apply default values for missing required parameters (e.g. WaitMsBeforeAsync, toolSummary)
  for (const [canonParam, paramCfg] of Object.entries(config.params)) {
    if (normalized[canonParam] === undefined && paramCfg.defaultValue !== undefined) {
      normalized[canonParam] = paramCfg.defaultValue;
    }
  }

  return normalized;
}

// ─── Utility Functions ────────────────────────────────────────────────────

const NUMERIC_SCHEMA_FIELDS = [
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
  'minimum',
  'maximum',
  'minProperties',
  'maxProperties',
];

/**
 * Recursively converts Gemini parameter types (UPPERCASE) to lowercase format,
 * and normalizes stringified numeric constraints (e.g. proto3 int64 minLength: "1") to numbers.
 * Gemini uses uppercase (STRING, NUMBER); OpenAI/Anthropic/Google AI Studio need lowercase and valid number types.
 */
export function fixParamTypes(properties: Record<string, unknown> | undefined): void {
  if (!properties) return;
  for (const key of Object.keys(properties)) {
    const val = properties[key];
    if (val && typeof val === 'object') {
      const obj = val as Record<string, unknown>;
      if (typeof obj.type === 'string') {
        obj.type = (obj.type as string).toLowerCase();
      }
      for (const numKey of NUMERIC_SCHEMA_FIELDS) {
        if (numKey in obj) {
          const raw = obj[numKey];
          if (typeof raw === 'string') {
            const n = Number(raw);
            if (!isNaN(n)) {
              obj[numKey] = n;
            } else {
              delete obj[numKey];
            }
          }
        }
      }
      if (obj.properties && typeof obj.properties === 'object') {
        fixParamTypes(obj.properties as Record<string, unknown>);
      }
      if (obj.items && typeof obj.items === 'object') {
        const items = obj.items as Record<string, unknown>;
        if (typeof items.type === 'string') {
          items.type = (items.type as string).toLowerCase();
        }
        for (const numKey of NUMERIC_SCHEMA_FIELDS) {
          if (numKey in items) {
            const raw = items[numKey];
            if (typeof raw === 'string') {
              const n = Number(raw);
              if (!isNaN(n)) {
                items[numKey] = n;
              } else {
                delete items[numKey];
              }
            }
          }
        }
        if (items.properties && typeof items.properties === 'object') {
          fixParamTypes(items.properties as Record<string, unknown>);
        }
      }
    }
  }
}

/**
 * Translates generic shell/terminal commands (run_command) or legacy tool names into native Antigravity file tools.
 */
export function translateToolCallToNative(name: string, args: ToolCallArgs): TranslatedToolCall {
  const canonicalName = TOOL_NAME_ALIASES[name] || name;

  if (canonicalName !== 'run_command' || !args || !args.CommandLine) {
    return { name: canonicalName, args: args as Record<string, unknown> };
  }

  const cmd = args.CommandLine.trim();
  const cwd = args.Cwd || process.cwd();

  // If command uses chaining (&&, ||, ;, &) or pipes (|), it is a shell pipeline and must NOT be translated
  const hasChainingOrPipe = /(&&|\|\||[;|])/.test(cmd);
  if (hasChainingOrPipe) {
    return { name: 'run_command', args: args as Record<string, unknown> };
  }

  // 1. read_file translation: ONLY simple single-file reads (no redirects, no multiple files, no flags)
  if (!/[><]/.test(cmd)) {
    const catMatch = /^(cat|type)\s+(?:(["'])(.*?)\2|([^\s"'>;&|]+))$/i.exec(cmd);
    if (catMatch) {
      const filePath = (catMatch[3] !== undefined ? catMatch[3] : catMatch[4]).trim();
      if (filePath && !filePath.startsWith('-')) {
        const isAbs = path.isAbsolute(filePath) || /^[a-zA-Z]:[/\\]/.test(filePath);
        const absPath = isAbs ? filePath : path.resolve(cwd, filePath);
        log.info(`[Proxy] Translating run_command "${cmd}" to read_file on "${absPath}"`);
        return { name: 'read_file', args: { Path: absPath } };
      }
    }
  }

  // 2. write_file translation (echo redirect)
  const echoRedirectMatch = /^(echo|printf)\s+(.+?)\s*>{1,2}\s*(.+)$/i.exec(cmd);
  if (echoRedirectMatch) {
    const content = echoRedirectMatch[2].replace(/^["']|["']$/g, '');
    const filePath = echoRedirectMatch[3].trim();
    if (filePath && !/[><|;&]/.test(filePath)) {
      const isAbs = path.isAbsolute(filePath) || /^[a-zA-Z]:[/\\]/.test(filePath);
      const absPath = isAbs ? filePath : path.resolve(cwd, filePath);
      log.info(`[Proxy] Translating run_command "${cmd}" to write_file on "${absPath}"`);
      return {
        name: 'write_file',
        args: {
          Path: absPath,
          Content: content,
          Append: cmd.includes('>>'),
          Overwrite: !cmd.includes('>>'),
        },
      };
    }
  }

  return { name: 'run_command', args: args as Record<string, unknown> };
}

/**
 * Formats native file tool outputs (JSON/Array) back into standard textual command-line outputs.
 */
export function formatTranslatedResponse(translatedInfo: TranslatedCallInfo, responseData: unknown): string {
  const { translatedName, cmd } = translatedInfo;
  log.info(`[Proxy] Formatting native response back to CLI for translated tool "${translatedName}" (Cmd: "${cmd}")`);

  if (translatedName === 'read_file' || translatedName === 'view_file') {
    if (responseData && typeof responseData === 'object') {
      const data = responseData as FileListResponse;
      return data.content || data.CodeContent || JSON.stringify(responseData);
    }
    return typeof responseData === 'string' ? responseData : JSON.stringify(responseData);
  }

  if (translatedName === 'write_file') {
    if (responseData && typeof responseData === 'object') {
      const data = responseData as Record<string, unknown>;
      if (data.success) return `File written successfully: ${data.path || data.Path || 'unknown'}`;
      return `Failed to write file: ${data.error || 'Unknown error'}`;
    }
    return typeof responseData === 'string' ? responseData : JSON.stringify(responseData);
  }

  if (translatedName === 'edit_file' || translatedName === 'replace_file_content') {
    if (responseData && typeof responseData === 'object') {
      const data = responseData as Record<string, unknown>;
      if (data.success) return `File edited successfully: ${data.path || data.Path || 'unknown'}`;
      return `Failed to edit file: ${data.error || 'Unknown error'}`;
    }
    return typeof responseData === 'string' ? responseData : JSON.stringify(responseData);
  }

  if (translatedName === 'list_dir') {
    if (Array.isArray(responseData)) {
      return (responseData as DirectoryItem[])
        .map((item) => {
          const typeIndicator = item.isDir ? '<DIR>' : '     ';
          const sizeStr = item.isDir ? '' : ` (${item.sizeBytes || 0} bytes)`;
          return `${typeIndicator}  ${item.name}${sizeStr}`;
        })
        .join('\n');
    }
    if (responseData && typeof responseData === 'object') {
      const data = responseData as FileListResponse;
      const items = data.files || data.children || [];
      if (Array.isArray(items)) {
        return items.map((item) => `${item.isDir ? '<DIR>' : '     '}  ${item.name}`).join('\n');
      }
    }
    return typeof responseData === 'string' ? responseData : JSON.stringify(responseData);
  }

  if (translatedName === 'grep_search') {
    if (Array.isArray(responseData)) {
      return (responseData as MatchResult[])
        .map((match) => `${match.Filename}:${match.LineNumber}:${match.LineContent}`)
        .join('\n');
    }
    return typeof responseData === 'string' ? responseData : JSON.stringify(responseData);
  }

  return typeof responseData === 'string' ? responseData : JSON.stringify(responseData);
}

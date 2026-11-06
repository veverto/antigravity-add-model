/**
 * Unit tests for shared translator utilities (utils.ts).
 */
import { describe, it, expect } from 'vitest';
import {
  fixParamTypes,
  normalizeToolArgs,
  translateToolCallToNative,
  formatTranslatedResponse,
} from '../proxy/translators/utils';

// ─── fixParamTypes ─────────────────────────────────────────────────────────

describe('fixParamTypes', () => {
  it('should lowercase top-level type', () => {
    const props: Record<string, unknown> = { type: { type: 'STRING', properties: {} } };
    fixParamTypes(props);
    expect((props.type as Record<string, string>).type).toBe('string');
  });

  it('should lowercase nested property types', () => {
    const props: Record<string, unknown> = {
      name: { type: 'STRING' },
      age: { type: 'NUMBER' },
    };
    fixParamTypes(props);
    expect((props.name as Record<string, string>).type).toBe('string');
    expect((props.age as Record<string, string>).type).toBe('number');
  });

  it('should handle items with type', () => {
    const props: Record<string, unknown> = {
      tags: { type: 'ARRAY', items: { type: 'STRING' } },
    };
    fixParamTypes(props);
    const tags = props.tags as Record<string, unknown>;
    expect(tags.type).toBe('array');
    expect((tags.items as Record<string, string>).type).toBe('string');
  });

  it('should handle nested properties inside items', () => {
    const props: Record<string, unknown> = {
      results: {
        type: 'ARRAY',
        items: { type: 'OBJECT', properties: { id: { type: 'INTEGER' } } },
      },
    };
    fixParamTypes(props);
    const results = props.results as Record<string, unknown>;
    expect(results.type).toBe('array');
    const items = results.items as Record<string, unknown>;
    expect(items.type).toBe('object');
    const itemProps = items.properties as Record<string, unknown>;
    expect((itemProps.id as Record<string, string>).type).toBe('integer');
  });

  it('should convert proto3 stringified numeric constraints (minLength, maxLength, etc.) to numbers', () => {
    const props: Record<string, unknown> = {
      Recipient: { type: 'STRING', minLength: '1', maxLength: '256' },
      Message: { type: 'STRING', minLength: '1', invalidNum: 'not-a-number' },
      itemsList: {
        type: 'ARRAY',
        minItems: '2',
        maxItems: '10',
        items: {
          type: 'STRING',
          minLength: '3',
        },
      },
    };
    fixParamTypes(props);
    const recipient = props.Recipient as Record<string, unknown>;
    expect(recipient.type).toBe('string');
    expect(recipient.minLength).toBe(1);
    expect(recipient.maxLength).toBe(256);

    const message = props.Message as Record<string, unknown>;
    expect(message.minLength).toBe(1);

    const itemsList = props.itemsList as Record<string, unknown>;
    expect(itemsList.minItems).toBe(2);
    expect(itemsList.maxItems).toBe(10);
    const items = itemsList.items as Record<string, unknown>;
    expect(items.minLength).toBe(3);
  });

  it('should handle undefined gracefully', () => {
    expect(() => fixParamTypes(undefined)).not.toThrow();
  });

  it('should handle empty object', () => {
    expect(() => fixParamTypes({})).not.toThrow();
  });
});

// ─── normalizeToolArgs ─────────────────────────────────────────────────────

describe('normalizeToolArgs', () => {
  it('should return empty object for null/undefined', () => {
    expect(normalizeToolArgs('read_file', null)).toEqual({});
    expect(normalizeToolArgs('read_file', undefined)).toEqual({});
  });

  it('should normalize read_file args using aliases and coerce numbers', () => {
    expect(normalizeToolArgs('read_file', { file_path: '/test.js', start_line: '10', end_line: '50' })).toEqual({
      Path: '/test.js',
      StartLine: 10,
      EndLine: 50,
    });
    expect(normalizeToolArgs('read_file', { filePath: '/a/b.ts' })).toEqual({ Path: '/a/b.ts' });
    expect(normalizeToolArgs('read_file', { AbsolutePath: '/x.txt' })).toEqual({ Path: '/x.txt' });
    expect(normalizeToolArgs('view_file', { file_path: '/test.js' })).toEqual({ Path: '/test.js' });
  });

  it('should normalize write_file args', () => {
    expect(normalizeToolArgs('write_file', { path: '/out.ts', content: 'console.log(1);' })).toEqual({
      Path: '/out.ts',
      Content: 'console.log(1);',
    });
    expect(normalizeToolArgs('write_file', { target: '/out2.ts', text: 'data', overwrite: 'true' })).toEqual({
      Path: '/out2.ts',
      Content: 'data',
      Overwrite: true,
    });
  });

  it('should normalize edit_file args', () => {
    const result = normalizeToolArgs('edit_file', {
      file: '/src/app.ts',
      old_string: 'const a = 1;',
      new_string: 'const a = 2;',
    });
    expect(result).toEqual({
      Path: '/src/app.ts',
      Target: 'const a = 1;',
      Replacement: 'const a = 2;',
    });
  });

  it('should normalize replace_file_content legacy args to edit_file schema', () => {
    expect(normalizeToolArgs('replace_file_content', { file: '/a.ts', search: 'x', replace: 'y' })).toEqual({
      Path: '/a.ts',
      Target: 'x',
      Replacement: 'y',
    });
  });

  it('should normalize run_command args with defaults for required params', () => {
    const result = normalizeToolArgs('run_command', { cmd: 'npm test', timeout: '10000' });
    expect(result).toEqual({
      CommandLine: 'npm test',
      WaitMsBeforeAsync: 10000,
      toolSummary: 'Run command',
    });
  });

  it('should normalize search_web args', () => {
    const result = normalizeToolArgs('search_web', { q: 'Antigravity IDE' });
    expect(result).toEqual({ query: 'Antigravity IDE' });
  });

  it('should normalize manage_task args', () => {
    const result = normalizeToolArgs('manage_task', { action: 'status', task_id: 'task-1' });
    expect(result).toEqual({ Action: 'status', TaskId: 'task-1' });
  });

  it('should normalize ask_question single object into questions array', () => {
    const result = normalizeToolArgs('ask_question', { question: 'Proceed?', options: ['Yes', 'No'] });
    expect(result).toEqual({
      questions: [{ question: 'Proceed?', options: ['Yes', 'No'] }],
    });
  });

  it('should normalize call_mcp_tool args', () => {
    const result = normalizeToolArgs('call_mcp_tool', {
      server_name: 'git',
      tool_name: 'git_status',
      args: { repo: '/tmp' },
    });
    expect(result).toEqual({
      ServerName: 'git',
      ToolName: 'git_status',
      Arguments: { repo: '/tmp' },
    });
  });

  it('should normalize invoke_subagent args', () => {
    const result = normalizeToolArgs('invoke_subagent', {
      type: 'research',
      role: 'Researcher',
      prompt: 'Check codebase',
    });
    expect(result).toEqual({
      TypeName: 'research',
      Role: 'Researcher',
      Prompt: 'Check codebase',
    });
  });

  it('should normalize search_marketplace query string into array', () => {
    const result = normalizeToolArgs('search_marketplace', { query: 'devtools' });
    expect(result).toEqual({ queries: ['devtools'] });
  });

  it('should normalize legacy list_dir args', () => {
    expect(normalizeToolArgs('list_dir', { directory: '/src' })).toEqual({ DirectoryPath: '/src' });
    expect(normalizeToolArgs('list_dir', { dir: '/tmp' })).toEqual({ DirectoryPath: '/tmp' });
    expect(normalizeToolArgs('list_dir', { DirectoryPath: '/a' })).toEqual({ DirectoryPath: '/a' });
  });

  it('should normalize legacy grep_search args', () => {
    const result = normalizeToolArgs('grep_search', { pattern: 'TODO', directory: '/src' });
    expect(result).toEqual({ Query: 'TODO', SearchPath: '/src' });
  });

  it('should pass through unknown tool args safely without destructive AbsolutePath injection', () => {
    const result = normalizeToolArgs('custom_mcp_tool', { file_path: '/test.txt', custom_flag: true });
    expect(result).toEqual({ file_path: '/test.txt', custom_flag: true });
  });

  it('should handle array args for known tools', () => {
    const result = normalizeToolArgs('read_file', ['/single.js'] as unknown as Record<string, unknown>);
    expect(result).toEqual({ Path: '/single.js' });
  });
});

// ─── translateToolCallToNative ──────────────────────────────────────────────

describe('translateToolCallToNative', () => {
  it('should pass through non-run_command calls and canonicalize name', () => {
    const result = translateToolCallToNative('view_file', { Path: '/x.ts' });
    expect(result).toEqual({ name: 'read_file', args: { Path: '/x.ts' } });
  });

  it('should canonicalize replace_file_content to edit_file', () => {
    const result = translateToolCallToNative('replace_file_content', { Path: '/x.ts', Target: 'a', Replacement: 'b' });
    expect(result).toEqual({ name: 'edit_file', args: { Path: '/x.ts', Target: 'a', Replacement: 'b' } });
  });

  it('should keep native shell commands like ls in run_command (Antigravity v2.6.0)', () => {
    const result = translateToolCallToNative('run_command', {
      CommandLine: 'ls /home/user',
      Cwd: '/tmp',
    });
    expect(result.name).toBe('run_command');
    expect(result.args.CommandLine).toBe('ls /home/user');
  });

  it('should keep dir in run_command (Windows)', () => {
    const result = translateToolCallToNative('run_command', {
      CommandLine: 'dir src',
      Cwd: 'C:\\project',
    });
    expect(result.name).toBe('run_command');
  });

  it('should translate cat to read_file with Path', () => {
    const result = translateToolCallToNative('run_command', {
      CommandLine: 'cat /etc/hosts',
      Cwd: '/',
    });
    expect(result.name).toBe('read_file');
    expect(result.args).toHaveProperty('Path', '/etc/hosts');
  });

  it('should translate type to read_file (Windows)', () => {
    const result = translateToolCallToNative('run_command', {
      CommandLine: 'type C:\\file.txt',
      Cwd: 'C:\\',
    });
    expect(result.name).toBe('read_file');
    expect(result.args).toHaveProperty('Path', 'C:\\file.txt');
  });

  it('should translate echo redirect to write_file with Path', () => {
    const result = translateToolCallToNative('run_command', {
      CommandLine: 'echo hello > /tmp/out.txt',
      Cwd: '/',
    });
    expect(result.name).toBe('write_file');
    expect(result.args).toHaveProperty('Path', '/tmp/out.txt');
    expect(result.args).toHaveProperty('Content', 'hello');
  });

  it('should keep grep in run_command (Antigravity v2.6.0)', () => {
    const result = translateToolCallToNative('run_command', {
      CommandLine: 'grep -i "TODO" /src',
      Cwd: '/',
    });
    expect(result.name).toBe('run_command');
  });

  it('should keep findstr in run_command (Windows)', () => {
    const result = translateToolCallToNative('run_command', {
      CommandLine: 'findstr /i TODO *.ts',
      Cwd: 'C:\\src',
    });
    expect(result.name).toBe('run_command');
  });

  it('should NOT translate multi-file cat or chained commands with redirection', () => {
    const result = translateToolCallToNative('run_command', {
      CommandLine: 'cat part1.md part2.md part3.md > historia.md && wc -w historia.md',
      Cwd: '/home/user',
    });
    expect(result.name).toBe('run_command');
    expect(result.args.CommandLine).toBe('cat part1.md part2.md part3.md > historia.md && wc -w historia.md');
  });

  it('should NOT translate cat with redirection', () => {
    const result = translateToolCallToNative('run_command', {
      CommandLine: 'cat a.txt b.txt > c.txt',
      Cwd: '/tmp',
    });
    expect(result.name).toBe('run_command');
  });

  it('should NOT translate pipelines like ls | grep', () => {
    const result = translateToolCallToNative('run_command', {
      CommandLine: 'ls | grep foo',
      Cwd: '/tmp',
    });
    expect(result.name).toBe('run_command');
  });

  it('should pass through unknown commands', () => {
    const result = translateToolCallToNative('run_command', {
      CommandLine: 'npm install',
    });
    expect(result.name).toBe('run_command');
  });
});

// ─── formatTranslatedResponse ───────────────────────────────────────────────

describe('formatTranslatedResponse', () => {
  const info = { originalName: 'run_command', translatedName: 'list_dir', cmd: 'ls' };

  it('should format list_dir array response', () => {
    const result = formatTranslatedResponse(info, [
      { name: 'file.ts', isDir: false, sizeBytes: 100 },
      { name: 'src', isDir: true },
    ]);
    expect(result).toContain('file.ts');
    expect(result).toContain('src');
    expect(result).toContain('<DIR>');
  });

  it('should format list_dir object response with children', () => {
    const result = formatTranslatedResponse(info, {
      children: [{ name: 'a.ts', isDir: false }],
    });
    expect(result).toContain('a.ts');
  });

  it('should format view_file response', () => {
    const viewInfo = { ...info, translatedName: 'view_file' };
    const result = formatTranslatedResponse(viewInfo, { content: 'hello world' });
    expect(result).toBe('hello world');
  });

  it('should format grep_search response', () => {
    const grepInfo = { ...info, translatedName: 'grep_search' };
    const result = formatTranslatedResponse(grepInfo, [{ Filename: 'a.ts', LineNumber: 10, LineContent: 'TODO: fix' }]);
    expect(result).toContain('a.ts:10:TODO: fix');
  });

  it('should format write_file success response', () => {
    const writeInfo = { ...info, translatedName: 'write_file' };
    const result = formatTranslatedResponse(writeInfo, { success: true, path: '/out.ts' });
    expect(result).toContain('File written successfully');
  });

  it('should format write_file failure response', () => {
    const writeInfo = { ...info, translatedName: 'write_file' };
    const result = formatTranslatedResponse(writeInfo, { success: false, error: 'Permission denied' });
    expect(result).toContain('Failed to write file');
  });

  it('should fallback to JSON.stringify for unknown types', () => {
    const result = formatTranslatedResponse(info, 42);
    expect(result).toBe('42');
  });

  it('should fallback to string for string inputs', () => {
    const result = formatTranslatedResponse(info, 'plain text');
    expect(result).toBe('plain text');
  });
});

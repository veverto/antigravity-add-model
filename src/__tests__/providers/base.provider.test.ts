import { describe, it, expect } from 'vitest';
import { BaseProvider } from '../../proxy/providers/base.provider';
import {
  GeminiRequestBody,
  GeminiContent,
  ModelTokenConfig,
  ProviderHeaders,
} from '../../proxy/types';

// Subclasse concreta para teste da BaseProvider
class ConcreteTestProvider extends BaseProvider {
  static override readonly id = 'test-provider';
  static override readonly displayName = 'Test Provider';
  static override readonly defaultBaseUrl = 'https://api.test.com/v1';
  static override readonly isLocal = false;

  formatPayload(
    geminiBody: GeminiRequestBody,
    modelName: string,
    _effort?: string,
    _tokenConfig?: ModelTokenConfig,
  ): Record<string, unknown> {
    return {
      model: modelName,
      contents: geminiBody.contents,
    };
  }

  translateResponse(res: unknown, _modelName: string): unknown {
    return res;
  }

  translateStreamChunk(chunk: unknown, _modelName: string): unknown | null {
    return chunk;
  }

  getHeaders(apiKey?: string): ProviderHeaders {
    return {
      'Content-Type': 'application/json',
      Authorization: apiKey ? `Bearer ${apiKey}` : undefined,
    };
  }

  getUrl(baseUrl: string, modelName: string, _isStream: boolean): string {
    return `${baseUrl}/models/${modelName}`;
  }
}

class ConcreteLocalProvider extends ConcreteTestProvider {
  static override readonly id = 'local-provider';
  static override readonly displayName = 'Local Provider (Ollama)';
  static override readonly defaultBaseUrl = 'http://localhost:11434';
  static override readonly isLocal = true;
}

describe('BaseProvider - Arquitetura, Contrato e Cotas', () => {
  it('deve refletir propriedades estáticas nos getters de instância', () => {
    const provider = new ConcreteTestProvider();
    expect(provider.id).toBe('test-provider');
    expect(provider.displayName).toBe('Test Provider');
    expect(provider.defaultBaseUrl).toBe('https://api.test.com/v1');
    expect(provider.isLocal).toBe(false);
  });

  it('deve retornar cota ilimitada quando isLocal === true', async () => {
    const localProvider = new ConcreteLocalProvider();
    expect(localProvider.isLocal).toBe(true);

    const quota = await localProvider.getQuota();
    expect(quota).toEqual({
      providerId: 'local-provider',
      providerName: 'Local Provider (Ollama)',
      remainingFraction: 1.0,
      refreshText: 'Ilimitado (Execução Local)',
    });
  });

  it('deve retornar null por padrão em getQuota para provedor remoto não-implementado', async () => {
    const remoteProvider = new ConcreteTestProvider();
    const quota = await remoteProvider.getQuota('sk-some-key');
    expect(quota).toBeNull();
  });
});

describe('BaseProvider - Poda Universal de Contexto (pruneHistory)', () => {
  const provider = new ConcreteTestProvider();

  it('deve preservar 100% dos dados no turno ativo e substituir saídas volumosas de ferramentas antigas por breadcrumbs', () => {
    const largeOldContent = 'A'.repeat(8000); // 8KB de código de turno antigo
    const shortOldOutput = JSON.stringify({ success: true }); // Saída curta antiga (<500 chars)
    const activeTurnToolContent = 'B'.repeat(3000); // Conteúdo do turno atual que o modelo acabou de ler

    const contents: GeminiContent[] = [
      // ── Turno 1 (Passado) ──
      {
        role: 'user',
        parts: [{ text: 'Por favor, leia o arquivo principal index.ts' }],
      },
      {
        role: 'model',
        parts: [
          {
            functionCall: {
              name: 'view_file',
              args: { AbsolutePath: '/workspace/src/index.ts' },
              id: 'call_1',
            },
          },
        ],
      },
      {
        role: 'function',
        parts: [
          {
            functionResponse: {
              name: 'view_file',
              id: 'call_1',
              response: { content: largeOldContent },
            },
          },
        ],
      },
      {
        role: 'model',
        parts: [
          {
            text: 'Analisei o index.ts. Agora vou listar a pasta.',
          },
          {
            functionCall: {
              name: 'list_dir',
              args: { DirectoryPath: '/workspace/src' },
              id: 'call_2',
            },
          },
        ],
      },
      {
        role: 'function',
        parts: [
          {
            functionResponse: {
              name: 'list_dir',
              id: 'call_2',
              response: shortOldOutput,
            },
          },
        ],
      },
      {
        role: 'model',
        parts: [{ text: 'Pasta verificada com sucesso.' }],
      },

      // ── Turno 2 (Ativo - Começa na última mensagem do usuário) ──
      {
        role: 'user',
        parts: [{ text: 'Agora leia a linha 20 do controller.ts e altere.' }],
      },
      {
        role: 'model',
        parts: [
          {
            functionCall: {
              name: 'view_file',
              args: { AbsolutePath: '/workspace/src/controller.ts' },
              id: 'call_3',
            },
          },
        ],
      },
      {
        role: 'function',
        parts: [
          {
            functionResponse: {
              name: 'view_file',
              id: 'call_3',
              response: { content: activeTurnToolContent },
            },
          },
        ],
      },
    ];

    const pruned = provider.pruneHistory(contents);

    // 1. Mensagens de texto dos usuários e do modelo devem estar 100% intocadas
    expect(pruned[0].parts![0].text).toBe('Por favor, leia o arquivo principal index.ts');
    expect(pruned[3].parts![0].text).toBe('Analisei o index.ts. Agora vou listar a pasta.');
    expect(pruned[5].parts![0].text).toBe('Pasta verificada com sucesso.');
    expect(pruned[6].parts![0].text).toBe('Agora leia a linha 20 do controller.ts e altere.');

    // 2. A ferramenta antiga volumosa (Turno 1, call_1) DEVE ter sido podada com breadcrumb
    const oldToolResponse = pruned[2].parts![0].functionResponse?.response;
    const oldToolStr = typeof oldToolResponse === 'string' ? oldToolResponse : JSON.stringify(oldToolResponse);
    expect(oldToolStr).not.toContain(largeOldContent);
    expect(oldToolStr).toContain('[view_file');
    expect(oldToolStr).toContain('omitido do histórico');

    // 3. A ferramenta antiga curta (Turno 1, call_2) com <500 chars NÃO deve ser corrompida
    const shortToolResponse = pruned[4].parts![0].functionResponse?.response;
    expect(shortToolResponse).toEqual(shortOldOutput);

    // 4. A ferramenta do Turno Ativo (call_3) DEVE estar 100% INTACTA
    const activeToolResponse = pruned[8].parts![0].functionResponse?.response;
    const activeToolStr = typeof activeToolResponse === 'string' ? activeToolResponse : JSON.stringify(activeToolResponse);
    expect(activeToolStr).toContain(activeTurnToolContent);
  });

  it('translateRequest deve executar o ciclo Template Method e aplicar pruneHistory', () => {
    const rawLarge = 'X'.repeat(6000);
    const body: GeminiRequestBody = {
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Primeiro prompt' }],
        },
        {
          role: 'function',
          parts: [
            {
              functionResponse: {
                name: 'view_file',
                response: rawLarge,
              },
            },
          ],
        },
        {
          role: 'user',
          parts: [{ text: 'Prompt ativo' }],
        },
      ],
    };

    const res = provider.translateRequest(body, 'test-model') as { contents: GeminiContent[] };
    expect(res.contents).toBeDefined();

    // A resposta da ferramenta no turno anterior ao prompt ativo deve ter sido compactada
    const toolPart = res.contents[1].parts![0].functionResponse?.response;
    const toolStr = typeof toolPart === 'string' ? toolPart : JSON.stringify(toolPart);
    expect(toolStr).not.toContain(rawLarge);
    expect(toolStr).toContain('omitido do histórico');
  });
});

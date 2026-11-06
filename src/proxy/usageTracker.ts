import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import log from 'electron-log';
import { calculateCost, estimateTokens } from './pricing';

export interface ProviderCostOverride {
  enabled?: boolean; // true = force show, false = force hide, undefined = inherit
  showSessionTotal?: boolean; // true = force show, false = force hide, undefined = inherit
}

export interface CostSettings {
  showCostBadges: boolean;
  showSessionTotal: boolean;
  providers: Record<string, boolean>;
  providerOverrides?: Record<string, ProviderCostOverride>;
}

export const DEFAULT_COST_SETTINGS: CostSettings = {
  showCostBadges: true,
  showSessionTotal: true,
  providers: {
    google: true,
    openrouter: true,
    openai: true,
    anthropic: true,
    deepseek: true,
    ollama: true,
    groq: true,
    mistral: true,
    cerebras: true,
    custom: true,
  },
  providerOverrides: {},
};

export interface TurnUsageRecord {
  id: string;
  conversationId: string;
  stepIndex?: number;
  timestamp: number;
  provider: string;
  model: string;
  isCustom: boolean;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  sessionTotalCostUsd: number;
  sessionTotalTokens: number;
}

function getSettingsDir(): string {
  const dir = path.join(os.homedir(), '.gemini', 'antigravity-ide');
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (_) {}
  }
  return dir;
}

function getSettingsFilePath(): string {
  return path.join(getSettingsDir(), 'byok_cost_settings.json');
}

function getUsageHistoryFilePath(): string {
  return path.join(getSettingsDir(), 'byok_usage_history.json');
}

class UsageTrackerService {
  private settings: CostSettings = { ...DEFAULT_COST_SETTINGS };
  private history: TurnUsageRecord[] = [];
  private conversationTotals: Map<string, { totalCost: number; totalTokens: number }> = new Map();

  constructor() {
    this.loadSettings();
    this.loadHistory();
  }

  public getSettings(): CostSettings {
    return {
      ...this.settings,
      providers: { ...this.settings.providers },
      providerOverrides: { ...(this.settings.providerOverrides || {}) },
    };
  }

  public loadSettings(): CostSettings {
    try {
      const p = getSettingsFilePath();
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf-8');
        const parsed = JSON.parse(raw);
        this.settings = {
          showCostBadges: parsed.showCostBadges ?? DEFAULT_COST_SETTINGS.showCostBadges,
          showSessionTotal: parsed.showSessionTotal ?? DEFAULT_COST_SETTINGS.showSessionTotal,
          providers: {
            ...DEFAULT_COST_SETTINGS.providers,
            ...(parsed.providers || {}),
          },
          providerOverrides: {
            ...(parsed.providerOverrides || {}),
          },
        };
      }
    } catch (err) {
      log.warn('[UsageTracker] Failed to read cost settings, using defaults:', err);
    }
    return this.getSettings();
  }

  public saveSettings(newSettings: Partial<CostSettings>): CostSettings {
    this.settings = {
      ...this.settings,
      ...newSettings,
      providers: {
        ...this.settings.providers,
        ...(newSettings.providers || {}),
      },
      providerOverrides: {
        ...(this.settings.providerOverrides || {}),
        ...(newSettings.providerOverrides || {}),
      },
    };
    try {
      fs.writeFileSync(getSettingsFilePath(), JSON.stringify(this.settings, null, 2), 'utf-8');
      log.info('[UsageTracker] Saved updated cost settings to disk');
    } catch (err) {
      log.error('[UsageTracker] Failed to save cost settings:', err);
    }
    return this.getSettings();
  }

  public loadHistory(): void {
    try {
      const p = getUsageHistoryFilePath();
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf-8');
        const parsed: TurnUsageRecord[] = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.history = parsed.slice(-500); // keep last 500
          for (const rec of this.history) {
            const current = this.conversationTotals.get(rec.conversationId) || { totalCost: 0, totalTokens: 0 };
            current.totalCost += rec.costUsd;
            current.totalTokens += rec.totalTokens;
            this.conversationTotals.set(rec.conversationId, current);
          }
        }
      }
    } catch (err) {
      log.warn('[UsageTracker] Failed to load usage history:', err);
    }
  }

  public recordUsage(data: {
    conversationId?: string;
    stepIndex?: number;
    provider: string;
    model: string;
    isCustom: boolean;
    inputTokens?: number;
    outputTokens?: number;
    explicitCost?: number;
  }): TurnUsageRecord {
    const convoId = data.conversationId || 'default-session';
    const inTokens = Math.max(0, data.inputTokens || 0);
    const outTokens = Math.max(0, data.outputTokens || 0);
    const totTokens = inTokens + outTokens;

    const cost = calculateCost(data.provider, data.model, inTokens, outTokens, data.explicitCost);

    const prev = this.conversationTotals.get(convoId) || { totalCost: 0, totalTokens: 0 };
    const newTotalCost = Number((prev.totalCost + cost).toFixed(6));
    const newTotalTokens = prev.totalTokens + totTokens;
    this.conversationTotals.set(convoId, { totalCost: newTotalCost, totalTokens: newTotalTokens });

    const record: TurnUsageRecord = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      conversationId: convoId,
      stepIndex: data.stepIndex,
      timestamp: Date.now(),
      provider: data.provider || 'unknown',
      model: data.model || 'unknown',
      isCustom: data.isCustom,
      inputTokens: inTokens,
      outputTokens: outTokens,
      totalTokens: totTokens,
      costUsd: cost,
      sessionTotalCostUsd: newTotalCost,
      sessionTotalTokens: newTotalTokens,
    };

    this.history.push(record);
    if (this.history.length > 500) {
      this.history = this.history.slice(-500);
    }

    try {
      fs.writeFileSync(getUsageHistoryFilePath(), JSON.stringify(this.history, null, 2), 'utf-8');
    } catch (err) {
      log.warn('[UsageTracker] Failed to persist usage history record:', err);
    }

    return record;
  }

  public getLastUsage(conversationId?: string): TurnUsageRecord | null {
    if (!conversationId) {
      return this.history.length > 0 ? this.history[this.history.length - 1] : null;
    }
    for (let i = this.history.length - 1; i >= 0; i--) {
      if (this.history[i].conversationId === conversationId) {
        return this.history[i];
      }
    }
    return null;
  }

  public getStepUsage(conversationId: string, stepIndex: number): TurnUsageRecord | null {
    for (let i = this.history.length - 1; i >= 0; i--) {
      const rec = this.history[i];
      if (rec.conversationId === conversationId && rec.stepIndex === stepIndex) {
        return rec;
      }
    }
    const convoRecords = this.history.filter((h) => h.conversationId === conversationId);
    if (stepIndex >= 0 && stepIndex < convoRecords.length) {
      return convoRecords[stepIndex];
    }
    return null;
  }

  public getConversationSummary(conversationId: string): { totalCostUsd: number; totalTokens: number; turns: TurnUsageRecord[] } {
    const turns = this.history.filter((h) => h.conversationId === conversationId);
    const totals = this.conversationTotals.get(conversationId) || { totalCost: 0, totalTokens: 0 };
    return {
      totalCostUsd: totals.totalCost,
      totalTokens: totals.totalTokens,
      turns,
    };
  }

  public clearHistory(): void {
    this.history = [];
    this.conversationTotals.clear();
    try {
      fs.writeFileSync(getUsageHistoryFilePath(), '[]', 'utf-8');
      log.info('[UsageTracker] Cleared usage history');
    } catch (err) {
      log.warn('[UsageTracker] Failed to clear usage history file:', err);
    }
  }
}

export const usageTracker = new UsageTrackerService();


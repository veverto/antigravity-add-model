import { describe, it, expect, beforeEach } from 'vitest';
import { usageTracker, DEFAULT_COST_SETTINGS } from '../proxy/usageTracker';

describe('Usage Tracker Service', () => {
  beforeEach(() => {
    usageTracker.saveSettings({ ...DEFAULT_COST_SETTINGS });
  });

  it('should load default cost settings', () => {
    const settings = usageTracker.getSettings();
    expect(settings.showCostBadges).toBe(true);
    expect(settings.showSessionTotal).toBe(true);
    expect(settings.providers.deepseek).toBe(true);
    expect(settings.providers.google).toBe(true);
  });

  it('should save and retrieve updated cost settings with provider overrides', () => {
    usageTracker.saveSettings({
      showCostBadges: true,
      showSessionTotal: true,
      providerOverrides: {
        deepseek: { enabled: true, showSessionTotal: false },
        google: { enabled: false },
      },
    });
    const updated = usageTracker.getSettings();
    expect(updated.showCostBadges).toBe(true);
    expect(updated.providerOverrides?.deepseek?.enabled).toBe(true);
    expect(updated.providerOverrides?.deepseek?.showSessionTotal).toBe(false);
    expect(updated.providerOverrides?.google?.enabled).toBe(false);
    expect(updated.providerOverrides?.google?.showSessionTotal).toBeUndefined();
  });

  it('should record turn usage and accumulate session totals', () => {
    const convoId = 'test-session-' + Date.now();
    const r1 = usageTracker.recordUsage({
      conversationId: convoId,
      stepIndex: 1,
      provider: 'deepseek',
      model: 'deepseek-chat',
      isCustom: true,
      inputTokens: 100_000,
      outputTokens: 50_000,
    });

    expect(r1.costUsd).toBe(0.028);
    expect(r1.sessionTotalCostUsd).toBe(0.028);
    expect(r1.sessionTotalTokens).toBe(150_000);

    const r2 = usageTracker.recordUsage({
      conversationId: convoId,
      stepIndex: 2,
      provider: 'deepseek',
      model: 'deepseek-chat',
      isCustom: true,
      inputTokens: 50_000,
      outputTokens: 25_000,
    });

    expect(r2.costUsd).toBe(0.014);
    expect(r2.sessionTotalCostUsd).toBe(0.042);
    expect(r2.sessionTotalTokens).toBe(225_000);

    const summary = usageTracker.getConversationSummary(convoId);
    expect(summary.totalCostUsd).toBe(0.042);
    expect(summary.totalTokens).toBe(225_000);
    expect(summary.turns.length).toBe(2);

    const step1 = usageTracker.getStepUsage(convoId, 1);
    expect(step1?.costUsd).toBe(0.028);
  });
});


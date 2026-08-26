import { describe, it, expect } from 'vitest';
import { validateCustomModel, validateCustomModels } from '../schemaValidator';

describe('schemaValidator - reasoningEffortLevels', () => {
  const baseValidModel = {
    name: 'models/o3-mini',
    displayName: 'o3-mini',
    provider: 'openai',
    apiUrl: 'https://api.openai.com/v1/chat/completions',
    apiKey: 'sk-test',
  };

  it('should accept valid reasoningEffortLevels array', () => {
    const model = {
      ...baseValidModel,
      reasoningEffortLevels: ['Default', 'Low', 'Medium', 'High'],
    };
    expect(validateCustomModel(model)).toEqual({ valid: true });
  });

  it('should accept subsets of reasoningEffortLevels with case-insensitivity', () => {
    const model = {
      ...baseValidModel,
      reasoningEffortLevels: ['low', 'HIGH'],
    };
    expect(validateCustomModel(model)).toEqual({ valid: true });
  });

  it('should reject non-array reasoningEffortLevels', () => {
    const model = {
      ...baseValidModel,
      reasoningEffortLevels: 'High',
    };
    const res = validateCustomModel(model);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('must be an array of strings');
  });

  it('should reject invalid effort level strings', () => {
    const model = {
      ...baseValidModel,
      reasoningEffortLevels: ['Low', 'SuperHigh'],
    };
    const res = validateCustomModel(model);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('Invalid reasoning effort level');
  });
});

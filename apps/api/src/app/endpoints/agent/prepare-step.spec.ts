import type { PrepareStepResult, StepResult, ToolSet } from 'ai';

import {
  createPrepareStep,
  getToolCallHistory,
  hasBeenCalled,
  loadSkills
} from './prepare-step';

const BASE = 'You are a financial assistant.';

function callPrepareStep(
  prepareStep: ReturnType<typeof createPrepareStep>,
  opts: Parameters<ReturnType<typeof createPrepareStep>>[0]
): NonNullable<PrepareStepResult> {
  return prepareStep(opts) as NonNullable<PrepareStepResult>;
}

function makeStep(toolNames: string[]): StepResult<ToolSet> {
  return {
    toolCalls: toolNames.map((toolName) => ({
      type: 'tool-call' as const,
      toolCallId: 'id',
      toolName,
      args: {}
    })),
    toolResults: [],
    text: '',
    reasoning: undefined,
    reasoningDetails: [],
    files: [],
    sources: [],
    finishReason: 'tool-calls',
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    warnings: [],
    request: {},
    response: {
      id: 'r1',
      timestamp: new Date(),
      modelId: 'test',
      headers: {}
    },
    providerMetadata: undefined,
    experimental_providerMetadata: undefined,
    stepType: 'initial',
    isContinued: false
  } as unknown as StepResult<ToolSet>;
}

describe('getToolCallHistory', () => {
  it('extracts tool names from steps', () => {
    const steps = [
      makeStep(['portfolio_analysis']),
      makeStep(['market_data', 'holdings_lookup'])
    ];
    expect(getToolCallHistory(steps)).toEqual([
      'portfolio_analysis',
      'market_data',
      'holdings_lookup'
    ]);
  });

  it('returns empty array for no steps', () => {
    expect(getToolCallHistory([])).toEqual([]);
  });
});

describe('hasBeenCalled', () => {
  it('returns true when tool is in history', () => {
    expect(hasBeenCalled(['market_data', 'holdings_lookup'], 'market_data')).toBe(true);
  });

  it('returns false when tool is not in history', () => {
    expect(hasBeenCalled(['market_data'], 'account_manage')).toBe(false);
  });
});

describe('loadSkills', () => {
  it('loads skills from disk', () => {
    const dir = __dirname + '/skills';
    const skills = loadSkills(dir);

    expect(skills.length).toBeGreaterThanOrEqual(2);

    const names = skills.map((s) => s.name);
    expect(names).toContain('transaction');
    expect(names).toContain('market-data');
  });

  it('returns empty array for non-existent dir', () => {
    expect(loadSkills('/tmp/nonexistent-skills-dir')).toEqual([]);
  });
});

describe('createPrepareStep', () => {
  const skills = loadSkills(__dirname + '/skills');
  const prepareStep = createPrepareStep(skills, BASE);

  it('excludes activity_manage when no context tools called', () => {
    const result = callPrepareStep(prepareStep, {
      steps: [],
      stepNumber: 0,
      model: {} as any,
      messages: [],
      experimental_context: undefined
    });

    expect(result.activeTools).not.toContain('activity_manage');
    expect(result.activeTools).toContain('portfolio_analysis');
    expect(result.activeTools).toContain('portfolio_performance');
    expect(result.activeTools).toContain('holdings_lookup');
    expect(result.activeTools).toContain('market_data');
    expect(result.activeTools).toContain('symbol_search');
    expect(result.activeTools).toContain('transaction_history');
    expect(result.activeTools).toContain('account_manage');
    expect(result.activeTools).toContain('tag_manage');
    expect(result.activeTools).toContain('watchlist_manage');
  });

  it('includes activity_manage after account_manage called', () => {
    const result = callPrepareStep(prepareStep, {
      steps: [makeStep(['account_manage'])],
      stepNumber: 1,
      model: {} as any,
      messages: [],
      experimental_context: undefined
    });

    expect(result.activeTools).toContain('activity_manage');
    expect(result.activeTools).toContain('account_manage');
  });

  it('includes activity_manage after transaction_history called', () => {
    const result = callPrepareStep(prepareStep, {
      steps: [makeStep(['transaction_history'])],
      stepNumber: 1,
      model: {} as any,
      messages: [],
      experimental_context: undefined
    });

    expect(result.activeTools).toContain('activity_manage');
    expect(result.activeTools).toContain('transaction_history');
  });

  it('excludes activity_manage when only read tools called', () => {
    const result = callPrepareStep(prepareStep, {
      steps: [makeStep(['portfolio_analysis', 'holdings_lookup'])],
      stepNumber: 1,
      model: {} as any,
      messages: [],
      experimental_context: undefined
    });

    expect(result.activeTools).not.toContain('activity_manage');
  });

  it('includes transaction skill in system prompt on step 0', () => {
    const result = callPrepareStep(prepareStep, {
      steps: [],
      stepNumber: 0,
      model: {} as any,
      messages: [],
      experimental_context: undefined
    });

    const system = result.system as string;
    expect(system).toContain(BASE);
    expect(system).toContain('WRITE SAFETY RULES');
    expect(system).not.toContain('MARKET DATA LOOKUPS');
  });

  it('includes market-data skill after market_data tool called', () => {
    const result = callPrepareStep(prepareStep, {
      steps: [makeStep(['market_data'])],
      stepNumber: 1,
      model: {} as any,
      messages: [],
      experimental_context: undefined
    });

    const system = result.system as string;
    expect(system).toContain('MARKET DATA LOOKUPS');
  });

  it('includes market-data skill after symbol_search called', () => {
    const result = callPrepareStep(prepareStep, {
      steps: [makeStep(['symbol_search'])],
      stepNumber: 1,
      model: {} as any,
      messages: [],
      experimental_context: undefined
    });

    const system = result.system as string;
    expect(system).toContain('MARKET DATA LOOKUPS');
  });

  it('returns base-only system when no market tools called', () => {
    const result = callPrepareStep(prepareStep, {
      steps: [makeStep(['portfolio_analysis'])],
      stepNumber: 1,
      model: {} as any,
      messages: [],
      experimental_context: undefined
    });

    const system = result.system as string;
    expect(system).toContain(BASE);
    expect(system).toContain('WRITE SAFETY RULES');
    expect(system).not.toContain('MARKET DATA LOOKUPS');
  });
});

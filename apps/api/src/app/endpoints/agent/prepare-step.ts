import type {
  ModelMessage,
  PrepareStepFunction,
  StepResult,
  ToolSet
} from 'ai';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export interface Skill {
  name: string;
  description: string;
  body: string;
}

const ALL_TOOLS = [
  'portfolio_analysis',
  'portfolio_performance',
  'holdings_lookup',
  'market_data',
  'symbol_search',
  'transaction_history',
  'account_manage',
  'tag_manage',
  'watchlist_manage',
  'activity_manage'
] as const;

type ToolName = (typeof ALL_TOOLS)[number];

/**
 * Read SKILL.md files from a directory tree.
 * Expects: dir/<skill-name>/SKILL.md with YAML frontmatter.
 */
export function loadSkills(dir: string): Skill[] {
  const skills: Skill[] = [];

  let entries: string[];

  try {
    entries = readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return skills;
  }

  for (const name of entries) {
    const filePath = join(dir, name, 'SKILL.md');

    try {
      const raw = readFileSync(filePath, 'utf-8');
      const parsed = parseFrontmatter(raw);

      if (parsed) {
        skills.push(parsed);
      }
    } catch {
      // skip missing files
    }
  }

  return skills;
}

function parseFrontmatter(raw: string): Skill | null {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw);

  if (!match) {
    return null;
  }

  const [, frontmatter, body] = match;
  const name = extractYamlValue(frontmatter, 'name');
  const description = extractYamlValue(frontmatter, 'description');

  if (!name) {
    return null;
  }

  return { name, description: description ?? '', body: body.trim() };
}

function extractYamlValue(yaml: string, key: string): string | null {
  const match = new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(yaml);

  return match ? match[1].trim() : null;
}

/**
 * Extract tool names called in previous steps (current session).
 */
export function getToolCallHistory(steps: StepResult<ToolSet>[]): string[] {
  return steps.flatMap((s) => s.toolCalls.map((tc) => tc.toolName));
}

/**
 * Extract tool names from conversation message history (prior turns).
 */
export function getToolCallsFromMessages(messages: ModelMessage[]): string[] {
  return messages.flatMap((m) => {
    if (m.role !== 'assistant' || !Array.isArray(m.content)) {
      return [];
    }

    return m.content
      .filter((part: any) => part.type === 'tool-call')
      .map((part: any) => part.toolName);
  });
}

/**
 * Check if a specific tool has been called in history.
 */
export function hasBeenCalled(history: string[], toolName: string): boolean {
  return history.includes(toolName);
}

/**
 * Factory: returns a prepareStep callback that gates tools and composes system prompt.
 */
export function createPrepareStep(
  skills: Skill[],
  baseInstructions: string,
  priorToolHistory: string[] = []
): PrepareStepFunction {
  const transactionSkill = skills.find((s) => s.name === 'transaction');
  const marketDataSkill = skills.find((s) => s.name === 'market-data');

  return ({ steps, messages }) => {
    const history = [
      ...priorToolHistory,
      ...getToolCallsFromMessages(messages),
      ...getToolCallHistory(steps)
    ];

    // Tool gating: activity_manage requires context from account_manage
    // (for create — need accountId) or transaction_history (for update/delete — need orderId)
    const hasActivityContext =
      hasBeenCalled(history, 'account_manage') ||
      hasBeenCalled(history, 'transaction_history');
    const activeTools: ToolName[] = ALL_TOOLS.filter(
      (tool) => tool !== 'activity_manage' || hasActivityContext
    );

    // Skill composition: append skill bodies based on step context
    const today = new Date().toISOString().split('T')[0];
    const systemParts: string[] = [baseInstructions, `Today is ${today}.`];

    // Transaction skill: always loaded (write tools are always visible)
    if (transactionSkill) {
      systemParts.push(transactionSkill.body);
    }

    // Market data skill: loaded when symbol_search or market_data has been called
    const marketDataActive =
      hasBeenCalled(history, 'symbol_search') ||
      hasBeenCalled(history, 'market_data');

    if (marketDataSkill && marketDataActive) {
      systemParts.push(marketDataSkill.body);
    }

    return {
      activeTools,
      system: systemParts.join('\n\n')
    };
  };
}

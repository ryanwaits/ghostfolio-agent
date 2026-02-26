export interface OutputValidationResult {
  valid: boolean;
  score: number;
  issues: string[];
}

const MIN_LENGTH = 10;
const MAX_LENGTH = 10_000;
const FORWARD_LOOKING_PATTERNS =
  /\b(will|should|expect|predict|forecast|going to|likely to)\b.*\b(grow|rise|fall|drop|increase|decrease|return)\b/i;
const DISCLAIMER_PATTERNS =
  /not (financial|investment) advice|past performance|no guarantee/i;

export function validateOutput({
  text,
  toolCalls
}: {
  text: string;
  toolCalls: string[];
}): OutputValidationResult {
  const issues: string[] = [];
  let checks = 0;
  let passed = 0;

  // Non-empty
  checks++;
  if (text.trim().length >= MIN_LENGTH) {
    passed++;
  } else {
    issues.push(`Response too short (${text.trim().length} chars)`);
  }

  // Reasonable length
  checks++;
  if (text.length <= MAX_LENGTH) {
    passed++;
  } else {
    issues.push(`Response too long (${text.length} chars)`);
  }

  // Tool data referenced: if tools were called, response should contain numbers
  if (toolCalls.length > 0) {
    checks++;
    if (/\d/.test(text)) {
      passed++;
    } else {
      issues.push('Tools called but no numeric data in response');
    }
  }

  // Disclaimer check for forward-looking language
  if (FORWARD_LOOKING_PATTERNS.test(text)) {
    checks++;
    if (DISCLAIMER_PATTERNS.test(text)) {
      passed++;
    } else {
      issues.push('Forward-looking language without disclaimer');
    }
  }

  const score = checks > 0 ? passed / checks : 1;

  return {
    valid: issues.length === 0,
    score,
    issues
  };
}

/**
 * Shared helpers for evals — authenticates + calls the agent endpoint,
 * parses the UI message stream, and extracts tool calls + text.
 */

const API_BASE = process.env.API_BASE || 'http://localhost:3333';

interface AgentResponse {
  text: string;
  toolCalls: string[];
}

export async function getAuthToken(): Promise<string> {
  const accessToken = process.env.TEST_USER_ACCESS_TOKEN;

  if (!accessToken) {
    throw new Error('TEST_USER_ACCESS_TOKEN not set in env');
  }

  const res = await fetch(
    `${API_BASE}/api/v1/auth/anonymous/${accessToken}`
  );

  if (!res.ok) {
    throw new Error(`Auth failed: ${res.status}`);
  }

  const data = (await res.json()) as { authToken: string };
  return data.authToken;
}

export async function callAgent(prompt: string): Promise<AgentResponse> {
  const jwt = await getAuthToken();

  const res = await fetch(`${API_BASE}/api/v1/agent/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!res.ok) {
    throw new Error(`Agent call failed: ${res.status} ${await res.text()}`);
  }

  const body = await res.text();
  return parseUIMessageStream(body);
}

function parseUIMessageStream(raw: string): AgentResponse {
  const lines = raw.split('\n');
  let text = '';
  const toolCalls: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed.startsWith('data: ')) continue;

    const data = trimmed.slice(6);

    if (data === '[DONE]') continue;

    try {
      const evt = JSON.parse(data);

      if (evt.type === 'text-delta') {
        text += evt.delta;
      } else if (evt.type === 'tool-input-start') {
        toolCalls.push(evt.toolName);
      }
    } catch {
      // skip unparseable lines
    }
  }

  return { text, toolCalls };
}

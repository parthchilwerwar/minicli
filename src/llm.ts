import { getApiKey, getModel, FALLBACK_MODEL } from './config.js';
import type { Message, ToolCall } from './memory.js';
import { loadContext } from './memory.js';
import { streamPrint, warn } from './ui.js';
import { initPersona, loadPersona } from './persona.js';
import { getSystemPrompt } from './system-prompt.js';

// Cache persona to avoid re-reading files on every call
let _personaCache: string | null = null;
function getPersona(): string {
  if (_personaCache === null) {
    initPersona();
    _personaCache = loadPersona();
  }
  return _personaCache;
}

// Call to refresh persona cache (e.g. after USER.md update)
export function refreshPersonaCache(): void { _personaCache = null; }

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export interface LLMResponse {
  content: string;
  tool_calls?: ToolCall[];
}

export interface ToolSchema {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

// ─── Core fetch (single attempt) ─────────────────────────────────────────────

async function fetchLLM(
  messages: Message[],
  tools: ToolSchema[],
  model: string,
  stream: boolean
): Promise<Response> {
  const apiKey = getApiKey();
  const body: Record<string, unknown> = { model, messages, stream };

  if (tools.length > 0) {
    body['tools']       = tools;
    body['tool_choice'] = 'auto';
  }

  return fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'minicli',
      'X-Title':      'minicli',
    },
    body: JSON.stringify(body),
  });
}

// ─── Public callLLM — with auto-fallback on 429 ───────────────────────────────

export async function callLLM(
  messages: Message[],
  tools: ToolSchema[] = [],
  modelOverride?: string,
  stream = false
): Promise<LLMResponse> {
  const primaryModel = getModel(modelOverride);
  
  const persona = getPersona();
  const ctx = loadContext();
  const sysPrompt = getSystemPrompt();
  let ctxStr = sysPrompt + '\n\n' + persona;
  if (Object.keys(ctx).length > 0) {
     ctxStr += `\n[Personal Context Profile:\n${JSON.stringify(ctx, null, 2)}]\n\n`;
  }

  const finalMessages = [...messages];
  if (ctxStr) {
     const sysIdx = finalMessages.findIndex((m) => m.role === 'system');
     if (sysIdx >= 0) {
        finalMessages[sysIdx] = { ...finalMessages[sysIdx], content: ctxStr + finalMessages[sysIdx].content };
     } else {
        finalMessages.unshift({ role: 'system', content: ctxStr });
     }
  }

  let res = await fetchLLM(finalMessages, tools, primaryModel, stream);

  // Auto-switch on rate limit
  if (res.status === 429) {
    const shortPrimary  = primaryModel.split('/').pop() ?? primaryModel;
    const shortFallback = FALLBACK_MODEL.split('/').pop() ?? FALLBACK_MODEL;
    warn(`${shortPrimary} is rate limited — switching to ${shortFallback}`);

    res = await fetchLLM(finalMessages, tools, FALLBACK_MODEL, stream);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 300)}`);
  }

  if (stream) return streamResponse(res);

  const data = (await res.json()) as {
    choices: Array<{
      message: { content?: string; tool_calls?: ToolCall[] };
    }>;
  };

  const choice = data.choices[0];
  if (!choice) throw new Error('No choices in LLM response');

  return {
    content:    choice.message.content    ?? '',
    tool_calls: choice.message.tool_calls,
  };
}

// ─── Streaming (SSE) ─────────────────────────────────────────────────────────

async function streamResponse(res: Response): Promise<LLMResponse> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body to stream');

  const decoder    = new TextDecoder();
  let   fullContent = '';
  const tcAccum: Record<number, { id: string; name: string; arguments: string }> = {};
  let   pending = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    pending += decoder.decode(value, { stream: true });
    const lines = pending.split('\n');
    pending     = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trimEnd();
      if (!trimmed.startsWith('data: ')) continue;
      const payload = trimmed.slice(6);
      if (payload === '[DONE]') continue;

      try {
        type Delta = {
          content?: string;
          tool_calls?: Array<{
            index: number;
            id?: string;
            function?: { name?: string; arguments?: string };
          }>;
        };
        const parsed = JSON.parse(payload) as { choices?: Array<{ delta?: Delta }> };
        const delta  = parsed.choices?.[0]?.delta;
        if (!delta) continue;

        if (delta.content) {
          fullContent += delta.content;
          streamPrint(delta.content);
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (!tcAccum[tc.index]) tcAccum[tc.index] = { id: '', name: '', arguments: '' };
            const acc = tcAccum[tc.index];
            if (tc.id)                  acc.id        = tc.id;
            if (tc.function?.name)      acc.name     += tc.function.name;
            if (tc.function?.arguments) acc.arguments += tc.function.arguments;
          }
        }
      } catch { /* skip malformed SSE lines */ }
    }
  }

  // Flush remaining buffer
  if (pending.startsWith('data: ')) {
    const payload = pending.slice(6);
    if (payload !== '[DONE]') {
      try {
        const parsed = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> };
        const txt    = parsed.choices?.[0]?.delta?.content;
        if (txt) { fullContent += txt; streamPrint(txt); }
      } catch { /* ignore */ }
    }
  }

  if (fullContent) process.stdout.write('\n');

  const toolCalls: ToolCall[] = Object.values(tcAccum).map((tc) => ({
    id:       tc.id,
    type:     'function' as const,
    function: { name: tc.name, arguments: tc.arguments },
  }));

  return {
    content:    fullContent,
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
  };
}

// ─── One-shot (no streaming) ──────────────────────────────────────────────────

export async function quickLLM(
  prompt:        string,
  modelOverride?: string
): Promise<string> {
  const res = await callLLM(
    [{ role: 'user', content: prompt }],
    [],
    modelOverride,
    false
  );
  return res.content;
}
